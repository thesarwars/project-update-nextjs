import { createConnection, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { appendFileSync, mkdirSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { serverError, serverLog } from "./serverLog";

/**
 * Mail, without a mail library.
 *
 * Three transports, tried in order: Resend's HTTP API, plain SMTP, and — when neither is
 * configured — the server console plus data/outbox/mail.log, so sign-up and password
 * reset still work on a laptop before any mail account exists.
 *
 * Resend needs nothing but fetch. SMTP is spoken directly rather than through nodemailer
 * because everything the app sends is one short plain-text message to one recipient,
 * which is a small enough slice of the protocol to be worth keeping the dependency diet.
 */

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

interface Transport {
  host: string;
  port: number;
  user: string | null;
  pass: string | null;
  from: string;
  /** 465 is TLS from the first byte; 587 and 25 start plain and upgrade. */
  implicitTls: boolean;
}

const TIMEOUT_MS = 20_000;

function readTransport(): Transport | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    user: process.env.SMTP_USER?.trim() || null,
    pass: process.env.SMTP_PASS ?? null,
    from: process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || `no-reply@${host}`,
    implicitTls: (process.env.SMTP_SECURE ?? (port === 465 ? "true" : "false")) === "true",
  };
}

/** True when mail actually leaves the machine, which the UI words differently. */
export function mailIsConfigured(): boolean {
  return readResend() !== null || readTransport() !== null;
}

/**
 * A transport failure is logged and falls back to the outbox rather than thrown.
 *
 * The alternative is an error page in the middle of a signup, which loses the code and
 * tells the person nothing they can act on. This way they reach the screen with the
 * "send another code" button on it, and the reason is on the server console where it
 * can actually be fixed.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const resend = readResend();
  if (resend) {
    try {
      return await sendViaResend(resend, mail);
    } catch (err) {
      serverError("Resend refused the message:", err);
      return writeToOutbox(mail);
    }
  }

  const transport = readTransport();
  if (!transport) return writeToOutbox(mail);

  try {
    return await sendViaSmtp(transport, mail);
  } catch (err) {
    serverError("SMTP refused the message:", err);
    return writeToOutbox(mail);
  }
}

/* ------------------------------------------------------------------ *
 * Resend
 * ------------------------------------------------------------------ */

interface Resend {
  key: string;
  from: string;
  /** Set to send every message to one address instead — for testing against a real inbox. */
  redirectTo: string | null;
}

function readResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return {
    key,
    from:
      process.env.RESEND_FROM_EMAIL?.trim() || process.env.MAIL_FROM?.trim() || "onboarding@resend.dev",
    redirectTo: process.env.RESEND_TO_EMAIL?.trim() || null,
  };
}

async function sendViaResend(resend: Resend, mail: Mail): Promise<void> {
  const redirected = resend.redirectTo && resend.redirectTo !== mail.to;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resend.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resend.from,
      to: [resend.redirectTo ?? mail.to],
      subject: mail.subject,
      text: redirected
        ? `[Redirected by RESEND_TO_EMAIL. This was addressed to ${mail.to}.]\n\n${mail.text}`
        : mail.text,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend returned ${response.status}: ${detail.slice(0, 400)}`);
  }
}

/* ------------------------------------------------------------------ *
 * SMTP
 * ------------------------------------------------------------------ */

async function sendViaSmtp(transport: Transport, mail: Mail): Promise<void> {
  const session = await Smtp.open(transport);
  try {
    await session.handshake(transport);
    await session.command(`MAIL FROM:<${transport.from}>`, 250);
    await session.command(`RCPT TO:<${mail.to}>`, 250);
    await session.command("DATA", 354);
    await session.command(buildMessage(transport.from, mail) + "\r\n.", 250);
    await session.command("QUIT", 221).catch(() => {});
  } finally {
    session.close();
  }
}

/* ------------------------------------------------------------------ *
 * Message
 * ------------------------------------------------------------------ */

/** RFC 2047, so a subject with an em dash or a name in it does not arrive as mojibake. */
function encodeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrap(base64: string): string {
  return (base64.match(/.{1,76}/g) ?? []).join("\r\n");
}

/**
 * The body goes out base64-encoded rather than raw. It sidesteps SMTP's 998-character
 * line limit, the leading-dot escape, and 7-bit-only servers in one move — all three of
 * which are silent corruption rather than an error.
 */
export function buildMessage(from: string, mail: Mail, now = new Date()): string {
  const id = `${now.getTime().toString(36)}.${process.pid.toString(36)}@${hostname()}`;
  const headers = [
    `From: ${from}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${id}>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "Auto-Submitted: auto-generated",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${wrap(Buffer.from(mail.text, "utf8").toString("base64"))}`;
}

/* ------------------------------------------------------------------ *
 * No transport configured
 * ------------------------------------------------------------------ */

function writeToOutbox(mail: Mail): void {
  const banner =
    `\n──────── mail (SMTP_HOST is not set, so nothing was sent) ────────\n` +
    `To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n` +
    `──────────────────────────────────────────────────────────────────\n`;
  serverLog(banner);

  try {
    const dir = path.join(process.cwd(), "data", "outbox");
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, "mail.log"), `${new Date().toISOString()}${banner}`, "utf8");
  } catch {
    // The console copy is the one that matters; a read-only disk must not fail a signup.
  }
}

interface Reply {
  code: number;
  text: string;
}

class Smtp {
  private socket: Socket | TLSSocket;
  private buffer = "";
  private queue: { resolve: (r: Reply) => void; reject: (e: Error) => void }[] = [];
  private ready: Reply[] = [];
  private failure: Error | null = null;
  private capabilities = "";

  private constructor(socket: Socket | TLSSocket) {
    this.socket = socket;
    this.listen(socket);
  }

  static async open(transport: Transport): Promise<Smtp> {
    const socket = transport.implicitTls
      ? tlsConnect({ host: transport.host, port: transport.port, servername: transport.host })
      : createConnection({ host: transport.host, port: transport.port });

    socket.setTimeout(TIMEOUT_MS);
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        socket.off(transport.implicitTls ? "secureConnect" : "connect", onReady);
        socket.off("error", onError);
      };
      socket.once(transport.implicitTls ? "secureConnect" : "connect", onReady);
      socket.once("error", onError);
    });

    const session = new Smtp(socket);
    await session.expect(220);
    return session;
  }

  /** EHLO, opportunistic STARTTLS, then AUTH. Split out so `sendMail` reads as a script. */
  async handshake(transport: Transport): Promise<void> {
    await this.ehlo();

    if (!transport.implicitTls && this.capabilities.includes("STARTTLS")) {
      await this.command("STARTTLS", 220);
      await this.upgrade(transport.host);
      await this.ehlo();
    }

    if (!transport.user || transport.pass === null) return;

    if (this.capabilities.includes("AUTH") && this.capabilities.includes("PLAIN")) {
      const token = Buffer.from(`\0${transport.user}\0${transport.pass}`, "utf8").toString("base64");
      await this.command(`AUTH PLAIN ${token}`, 235);
      return;
    }
    await this.command("AUTH LOGIN", 334);
    await this.command(Buffer.from(transport.user, "utf8").toString("base64"), 334);
    await this.command(Buffer.from(transport.pass, "utf8").toString("base64"), 235);
  }

  private async ehlo(): Promise<void> {
    const reply = await this.command(`EHLO ${hostname() || "localhost"}`, 250).catch(() => null);
    if (reply) {
      this.capabilities = reply.text.toUpperCase();
      return;
    }
    // Ancient or minimal servers answer HELO only, and then advertise nothing.
    await this.command(`HELO ${hostname() || "localhost"}`, 250);
    this.capabilities = "";
  }

  private async upgrade(servername: string): Promise<void> {
    const plain = this.socket;
    plain.removeAllListeners("data");
    plain.removeAllListeners("error");
    plain.removeAllListeners("close");
    plain.removeAllListeners("timeout");

    const secure = await new Promise<TLSSocket>((resolve, reject) => {
      const tls = tlsConnect({ socket: plain, servername }, () => resolve(tls));
      tls.once("error", reject);
    });
    secure.setTimeout(TIMEOUT_MS);
    this.socket = secure;
    this.listen(secure);
  }

  async command(line: string, expected: number): Promise<Reply> {
    if (this.failure) throw this.failure;
    this.socket.write(`${line}\r\n`);
    return this.expect(expected);
  }

  private expect(code: number): Promise<Reply> {
    return this.nextReply().then((reply) => {
      if (reply.code !== code) {
        throw new Error(`SMTP expected ${code} but the server said: ${reply.code} ${reply.text}`);
      }
      return reply;
    });
  }

  private nextReply(): Promise<Reply> {
    if (this.failure) return Promise.reject(this.failure);
    const buffered = this.ready.shift();
    if (buffered) return Promise.resolve(buffered);
    return new Promise((resolve, reject) => this.queue.push({ resolve, reject }));
  }

  private listen(socket: Socket | TLSSocket): void {
    socket.on("data", (chunk: Buffer | string) => this.onData(chunk.toString("utf8" as never)));
    socket.on("error", (err: Error) => this.fail(err));
    socket.on("timeout", () => this.fail(new Error("SMTP server stopped responding")));
    socket.on("close", () => this.fail(new Error("SMTP connection closed unexpectedly")));
  }

  /**
   * A reply is one or more lines; `250-EXTENSION` continues and `250 EXTENSION` ends it,
   * so the space in column four is the terminator.
   */
  private onData(chunk: string): void {
    this.buffer += chunk;
    let done = this.buffer.lastIndexOf("\r\n");
    while (done !== -1) {
      const lines = this.buffer.slice(0, done).split("\r\n");
      const last = lines[lines.length - 1];
      if (!/^\d{3} /.test(last)) return; // still mid-reply

      this.buffer = this.buffer.slice(done + 2);
      this.deliver({
        code: Number(last.slice(0, 3)),
        text: lines.map((l) => l.slice(4)).join("\n"),
      });
      done = this.buffer.lastIndexOf("\r\n");
    }
  }

  private deliver(reply: Reply): void {
    const waiting = this.queue.shift();
    if (waiting) waiting.resolve(reply);
    else this.ready.push(reply);
  }

  private fail(err: Error): void {
    if (this.failure) return;
    this.failure = err;
    const waiting = this.queue.splice(0);
    for (const w of waiting) w.reject(err);
  }

  close(): void {
    this.failure ??= new Error("SMTP session closed");
    this.socket.removeAllListeners("close");
    this.socket.destroy();
  }
}
