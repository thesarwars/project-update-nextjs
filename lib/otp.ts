import { randomInt, hash as cryptoHash, timingSafeEqual } from "node:crypto";
import {
  consumeEmailCode,
  createEmailCode,
  findLiveEmailCode,
  recordCodeAttempt,
  type CodePurpose,
} from "./db";
import { sendMail } from "./mail";

/**
 * Six-digit one-time codes, for proving an address at signup and at password reset.
 *
 * A code rather than a magic link: the same six digits work when the mail lands on a
 * phone and the signup is half-typed on a laptop, which is the common case on a small
 * team. Short secrets are only safe when guessing is bounded, so the limits below —
 * ten minutes, five attempts, one live code — are load-bearing, not decoration.
 */

export const CODE_LENGTH = 6;
const TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

/** Uniform over 000000–999999. `randomInt` avoids the modulo bias of `randomBytes % n`. */
function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/**
 * Bound to the user and the purpose, so a verification code cannot be replayed as a
 * reset code and a code stolen from one row is useless against another.
 */
function hashCode(userId: string, purpose: CodePurpose, code: string): string {
  return cryptoHash("sha256", `${userId}:${purpose}:${code}`, "hex");
}

export function normalizeCode(input: string): string {
  return input.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

const COPY: Record<CodePurpose, (code: string, name: string) => { subject: string; text: string }> =
  {
    verify: (code, name) => ({
      subject: `${code} is your Standup verification code`,
      text: `Hi ${name},\n\nYour code is ${code}\n\nEnter it to finish setting up your account. It expires in ${TTL_MINUTES} minutes.\n\nIf you did not sign up, you can ignore this — the account cannot be used until someone enters this code.\n`,
    }),
    reset: (code, name) => ({
      subject: `${code} is your Standup password reset code`,
      text: `Hi ${name},\n\nYour password reset code is ${code}\n\nIt expires in ${TTL_MINUTES} minutes, and using it signs out every device currently on this account.\n\nIf you did not ask to reset your password, ignore this and nothing changes.\n`,
    }),
  };

/** Issue a code and mail it. Any earlier code for the same purpose stops working. */
export async function sendCode(
  user: { id: string; email: string; name: string },
  purpose: CodePurpose,
): Promise<void> {
  const code = generateCode();
  createEmailCode({
    userId: user.id,
    purpose,
    codeHash: hashCode(user.id, purpose, code),
    expiresAt: new Date(Date.now() + TTL_MINUTES * 60_000).toISOString(),
  });

  const { subject, text } = COPY[purpose](code, user.name.split(" ")[0] || user.name);
  await sendMail({ to: user.email, subject, text });
}

export type CheckResult = "ok" | "wrong" | "expired" | "too-many-attempts";

/**
 * Check a code and, when it matches, burn it.
 *
 * The attempt is recorded before the comparison, so abandoning the request mid-flight
 * cannot be used to get a free guess.
 */
export function checkCode(userId: string, purpose: CodePurpose, entered: string): CheckResult {
  const live = findLiveEmailCode(userId, purpose);
  if (!live) return "expired";
  if (live.attempts >= MAX_ATTEMPTS) return "too-many-attempts";

  const attempts = recordCodeAttempt(live.id);
  const expected = Buffer.from(live.codeHash, "hex");
  const actual = Buffer.from(hashCode(userId, purpose, normalizeCode(entered)), "hex");

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return attempts >= MAX_ATTEMPTS ? "too-many-attempts" : "wrong";
  }

  consumeEmailCode(live.id);
  return "ok";
}
