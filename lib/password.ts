import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt parameters.
 *
 * `maxmem` must be passed explicitly: Node's default cap is 32 MiB and N=32768 needs
 * more, so omitting it throws ERR_CRYPTO_INVALID_SCRYPT_PARAMS rather than silently
 * using weaker settings.
 */
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_LENGTH = 32;

/**
 * `scrypt$N=…,r=…,p=…$salt$hash`, self-describing so the parameters can be raised later
 * while hashes written today still verify.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(plain, salt, KEY_LENGTH, SCRYPT);
  return `scrypt$N=${SCRYPT.N},r=${SCRYPT.r},p=${SCRYPT.p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

/**
 * Always async, never `scryptSync`. node:sqlite already blocks the event loop; a
 * synchronous 115 ms KDF on top would stall every other user's autosave for the whole
 * of someone else's login.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;

  const params = Object.fromEntries(
    parts[1].split(",").map((pair) => {
      const [k, v] = pair.split("=");
      return [k, Number(v)];
    }),
  ) as { N?: number; r?: number; p?: number };
  if (!params.N || !params.r || !params.p) return false;

  const salt = Buffer.from(parts[2], "base64");
  const expected = Buffer.from(parts[3], "base64");
  const derived = await scryptAsync(plain, salt, expected.length || KEY_LENGTH, {
    ...params,
    maxmem: SCRYPT.maxmem,
  } as { N: number; r: number; p: number; maxmem: number });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * A real hash of a value nobody knows, used when the email does not exist so that a miss
 * costs the same time as a hit. Without it, login latency enumerates the team's addresses.
 */
export const DUMMY_HASH =
  "scrypt$N=32768,r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/* ------------------------------------------------------------------ *
 * Password rules
 * ------------------------------------------------------------------ */

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwertyuiop", "letmein12", "iloveyou1", "welcome123", "admin123", "changeme",
  "football1", "sunshine1", "princess1", "trustno1", "passw0rd", "abc12345",
]);

/** Returns a problem to show the user, or null when the password is acceptable. */
export function checkPasswordStrength(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "That is longer than 200 characters.";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "That password is too common.";
  return null;
}
