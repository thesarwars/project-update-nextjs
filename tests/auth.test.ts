import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { hash } from "node:crypto";
import path from "node:path";
import os from "node:os";

/**
 * Signup, verification and reset, against a real database file.
 *
 * The database path is set before lib/db is imported, because the module opens on first
 * use. Every suite gets its own file under the OS temp directory — a previous run cost a
 * day of restoring real standup entries that a test had overwritten.
 */
const DB_FILE = path.join(os.tmpdir(), `standup-auth-test-${process.pid}.db`);
process.env.STANDUP_DB_FILE = DB_FILE;
// Force the console fallback: a test run must never reach a real mail provider.
delete process.env.SMTP_HOST;
delete process.env.RESEND_API_KEY;

const db = await import("../lib/db");
const otp = await import("../lib/otp");
const { hashPassword, verifyPassword } = await import("../lib/password");

/** The code never leaves sendCode, so tests recover it the way an attacker cannot: by hash. */
function crack(userId: string, purpose: "verify" | "reset"): string {
  const live = db.findLiveEmailCode(userId, purpose);
  assert.ok(live, "expected a live code");
  for (let n = 0; n < 1_000_000; n += 1) {
    const candidate = String(n).padStart(6, "0");
    if (hash("sha256", `${userId}:${purpose}:${candidate}`, "hex") === live.codeHash) {
      return candidate;
    }
  }
  throw new Error("no code matched");
}

before(() => {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    // rmSync, not a shell glob: `rm -f x*` with no matches aborts the whole chain in zsh.
    fs.rmSync(`${DB_FILE}${suffix}`, { force: true });
  }
});

after(() => {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    fs.rmSync(`${DB_FILE}${suffix}`, { force: true });
  }
});

describe("password hashing", () => {
  it("round-trips and rejects a near miss", async () => {
    const stored = await hashPassword("correct horse battery");
    assert.equal(await verifyPassword("correct horse battery", stored), true);
    assert.equal(await verifyPassword("correct horse batterY", stored), false);
  });
});

describe("sign-up", () => {
  it("creates an account that cannot sign in until the address is proven", async () => {
    const result = db.signUpUser({
      email: "ada@team.test",
      name: "Ada",
      passwordHash: await hashPassword("a-long-enough-password"),
    });
    assert.equal(result.ok, true);
    assert.ok(result.ok && result.user.emailVerifiedAt === null);
    assert.ok(result.ok && result.user.hasPassword);
  });

  it("lets an unfinished registration be taken over, and a finished one not", async () => {
    const first = db.signUpUser({
      email: "grace@team.test",
      name: "Grace",
      passwordHash: await hashPassword("first-password-here"),
    });
    assert.ok(first.ok);

    // Nobody proved the address yet, so a second attempt replaces the first.
    const second = db.signUpUser({
      email: "GRACE@team.test",
      name: "Grace H",
      passwordHash: await hashPassword("second-password-here"),
    });
    assert.ok(second.ok);
    assert.equal(second.reused, true);
    assert.equal(second.user.id, first.user.id);
    assert.equal(second.user.name, "Grace H");

    // Once proven, the address is hers and signing up again is refused.
    await otp.sendCode(second.user, "verify");
    assert.equal(otp.checkCode(second.user.id, "verify", crack(second.user.id, "verify")), "ok");
    db.markEmailVerified(second.user.id);

    const third = db.signUpUser({
      email: "grace@team.test",
      name: "Not Grace",
      passwordHash: await hashPassword("attacker-password-x"),
    });
    assert.equal(third.ok, false);
    assert.equal(third.ok === false && third.reason, "already-verified");
    assert.equal(db.findUserByEmail("grace@team.test")!.name, "Grace H");
  });
});

describe("one-time codes", () => {
  it("accepts the right code once and refuses the replay", async () => {
    const user = db.signUpUser({
      email: "linus@team.test",
      name: "Linus",
      passwordHash: await hashPassword("a-long-enough-password"),
    });
    assert.ok(user.ok);

    await otp.sendCode(user.user, "verify");
    const code = crack(user.user.id, "verify");

    assert.equal(otp.checkCode(user.user.id, "verify", code), "ok");
    // Consumed, so the same code is now indistinguishable from having none.
    assert.equal(otp.checkCode(user.user.id, "verify", code), "expired");
  });

  it("will not let a verification code be replayed as a reset code", async () => {
    const user = db.findUserByEmail("ada@team.test")!;
    await otp.sendCode(user, "verify");
    const code = crack(user.id, "verify");

    await otp.sendCode(user, "reset");
    assert.equal(otp.checkCode(user.id, "reset", code), "wrong");
  });

  it("stops guessing after five wrong tries", async () => {
    const signUp = db.signUpUser({
      email: "margaret@team.test",
      name: "Margaret",
      passwordHash: await hashPassword("a-long-enough-password"),
    });
    assert.ok(signUp.ok);
    await otp.sendCode(signUp.user, "verify");

    const right = crack(signUp.user.id, "verify");
    const wrong = right === "000000" ? "111111" : "000000";

    for (let i = 0; i < 4; i += 1) {
      assert.equal(otp.checkCode(signUp.user.id, "verify", wrong), "wrong");
    }
    assert.equal(otp.checkCode(signUp.user.id, "verify", wrong), "too-many-attempts");
    // The correct code is refused too — the budget is per code, not per guess pattern.
    assert.equal(otp.checkCode(signUp.user.id, "verify", right), "too-many-attempts");
  });

  it("keeps only one live code per purpose", async () => {
    const user = db.findUserByEmail("ada@team.test")!;
    await otp.sendCode(user, "reset");
    const first = crack(user.id, "reset");
    await otp.sendCode(user, "reset");

    assert.equal(otp.checkCode(user.id, "reset", first), "wrong");
    assert.equal(otp.checkCode(user.id, "reset", crack(user.id, "reset")), "ok");
  });
});

describe("password reset", () => {
  it("sets the password and ends every existing session", async () => {
    const user = db.findUserByEmail("linus@team.test")!;
    db.markEmailVerified(user.id);

    db.createSession({
      id: "sess-under-test",
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      userAgent: null,
    });
    assert.ok(db.findSession("sess-under-test"));

    db.resetUserPassword(user.id, await hashPassword("a-brand-new-password"));

    assert.equal(db.findSession("sess-under-test"), null);
    const after = db.findUserForSignIn("linus@team.test")!;
    assert.equal(await verifyPassword("a-brand-new-password", after.passwordHash!), true);
    assert.equal(await verifyPassword("a-long-enough-password", after.passwordHash!), false);
  });
});

describe("invitations", () => {
  it("refuses to hand over an account that already has a password", async () => {
    const project = db.createProject("Invite Test", ["Rosalind"]);
    const person = db.getProject(project.id)!.people[0];

    const owner = db.signUpUser({
      email: "rosalind@team.test",
      name: "Rosalind",
      passwordHash: await hashPassword("her-own-password-ok"),
    });
    assert.ok(owner.ok);
    db.markEmailVerified(owner.user.id);

    const token = "token-for-rosalind";
    db.createInvite({
      email: "rosalind@team.test",
      name: "Rosalind",
      role: "member",
      personId: person.id,
      tokenHash: hash("sha256", token, "hex"),
      createdBy: owner.user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // The bug this replaces: whoever opened the link was handed a session as her.
    const accepted = db.acceptInvite({
      tokenHash: hash("sha256", token, "hex"),
      name: "Not Rosalind",
      passwordHash: await hashPassword("attacker-password-x"),
    });
    assert.equal(accepted.ok, false);
    assert.equal(accepted.ok === false && accepted.reason, "sign-in-required");

    const stillHers = db.findUserForSignIn("rosalind@team.test")!;
    assert.equal(await verifyPassword("her-own-password-ok", stillHers.passwordHash!), true);

    // A stranger's session does not do it either — the email has to match.
    const stranger = db.signUpUser({
      email: "stranger@team.test",
      name: "Stranger",
      passwordHash: await hashPassword("a-long-enough-password"),
    });
    assert.ok(stranger.ok);
    const refused = db.claimInviteAs(hash("sha256", token, "hex"), stranger.user.id);
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false && refused.reason, "sign-in-required");

    // Her own session does.
    const claimed = db.claimInviteAs(hash("sha256", token, "hex"), owner.user.id);
    assert.equal(claimed.ok, true);
    assert.equal(claimed.ok && claimed.userId, owner.user.id);
  });
});

describe("mail", () => {
  it("encodes a non-ASCII subject rather than sending raw bytes", async () => {
    const { buildMessage } = await import("../lib/mail");
    const message = buildMessage("a@b.test", {
      to: "c@d.test",
      subject: "123456 — your code",
      text: "hello",
    });
    assert.match(message, /Subject: =\?UTF-8\?B\?/);
    assert.match(message, /Content-Transfer-Encoding: base64/);
    assert.equal(message.includes("\r\n\r\n"), true);
  });
});
