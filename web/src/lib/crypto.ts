/**
 * Envelope encryption for Google refresh tokens.
 *
 * A refresh token is a long-lived key to somebody's mailbox. Storing it in
 * plaintext means a database dump, a leaked backup, or a read-only SQL injection
 * anywhere in the stack hands over every user's Gmail. Encrypting it at the
 * application layer means Postgres only ever holds ciphertext, and the key that
 * opens it lives in an environment variable that the database has no access to.
 *
 * AES-256-GCM is used because it is authenticated: tampering with the stored
 * ciphertext produces a decryption error rather than silently different bytes.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const TAG_BYTES = 16;
const VERSION = 'v1';

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is not set. Generate one with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes, got ${bytes.length}.`,
    );
  }
  return bytes;
}

/** Returns "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return '';
  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Stored secret is malformed or uses an unknown version.');
  }
  const [, ivPart, tagPart, dataPart] = parts;
  const iv = Buffer.from(ivPart, 'base64url');
  const tag = Buffer.from(tagPart, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Stored secret has an invalid nonce or authentication tag.');
  }
  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** True when a value looks like something encryptSecret produced. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}.`) && value.split('.').length === 4;
}

/**
 * Constant-time string comparison, for anything an attacker could probe by
 * timing (webhook signatures, cron secrets).
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
