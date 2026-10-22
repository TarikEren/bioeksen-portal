/**
 * The password hash (DEC-129, ACC-10 rule 3).
 *
 * The app stores a password only as a `scrypt` hash of `node:crypto`, with a
 * random salt for each password. The stored value holds the parameters, the
 * salt and the hash, so a later change of the parameters still reads the old
 * values:
 *
 *   scrypt$<N>$<r>$<p>$<salt, base64>$<hash, base64>
 *
 * `hashPassword` and `verifyPassword` are asynchronous, so the work of `scrypt`
 * does not block the event loop. The longest password that the app hashes is
 * 128 characters (DEC-028), which bounds the cost of one call.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/** The parameters of a new hash: N = 2^15, r = 8, p = 1 (about 32 MiB, about 80 ms). */
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/** `scrypt` needs 128 * N * r bytes. The limit leaves room for a hash with a larger N. */
const MAX_MEMORY_BYTES = 128 * 1024 * 1024;

const FORMAT = /^scrypt\$(\d{1,8})\$(\d{1,3})\$(\d{1,3})\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/;

function derive(password: string, salt: Buffer, cost: number, blockSize: number, parallelism: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      length,
      { N: cost, r: blockSize, p: parallelism, maxmem: MAX_MEMORY_BYTES },
      (error, key) => {
        if (error === null) {
          resolve(key);
        } else {
          reject(error);
        }
      },
    );
  });
}

/** Hashes a password with a new random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM, KEY_LENGTH);
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELISM}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/**
 * Whether a password matches a stored hash. A stored value that has no known
 * form never matches. The comparison takes the same time whatever the byte
 * where the two values differ.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = FORMAT.exec(stored);
  if (match === null) {
    return false;
  }
  const [, cost, blockSize, parallelism, salt, hash] = match;
  if (cost === undefined || blockSize === undefined || parallelism === undefined || salt === undefined || hash === undefined) {
    return false;
  }
  const expected = Buffer.from(hash, "base64");
  try {
    const actual = await derive(
      password,
      Buffer.from(salt, "base64"),
      Number(cost),
      Number(blockSize),
      Number(parallelism),
      expected.length,
    );
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    // Parameters that `scrypt` refuses (N not a power of two, too much memory).
    return false;
  }
}

/**
 * A hash that no password matches. A sign-in for an unknown email address, an
 * inactive account or an account without a password verifies against it, so the
 * time of the answer does not tell the cases apart (ACC-20.AC2).
 */
let decoy: Promise<string> | undefined;

export function decoyHash(): Promise<string> {
  decoy ??= hashPassword(randomBytes(32).toString("base64"));
  return decoy;
}
