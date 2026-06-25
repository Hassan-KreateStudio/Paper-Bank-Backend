import { AppError } from "../../lib/errors";

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const textEncoder = new TextEncoder();

const bytesToHex = (bytes: Uint8Array) => {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const hexToBytes = (value: string) => {
  const pairs = value.match(/.{1,2}/g);

  if (!pairs) {
    return new Uint8Array();
  }

  return new Uint8Array(pairs.map((pair) => Number.parseInt(pair, 16)));
};

const importPasswordKey = async (password: string) => {
  return await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
};

const derivePasswordHash = async (password: string, salt: Uint8Array, iterations: number) => {
  const key = await importPasswordKey(password);
  const normalizedSalt = new Uint8Array(salt);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: normalizedSalt,
      iterations,
      hash: "SHA-256"
    },
    key,
    HASH_BYTES * 8
  );

  return new Uint8Array(bits);
};

export const hashStaffPassword = async (password: string) => {
  const normalizedPassword = password.trim();

  if (!normalizedPassword) {
    throw new AppError("Staff password cannot be empty.", 400);
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derivePasswordHash(normalizedPassword, salt, PBKDF2_ITERATIONS);

  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(hash)}`;
};

export const verifyStaffPassword = async (password: string, storedHash: string) => {
  const [algorithm, iterationsText, saltHex, hashHex] = storedHash.split("$");

  if (algorithm !== "pbkdf2_sha256" || !iterationsText || !saltHex || !hashHex) {
    throw new AppError("Stored staff password hash format is invalid.", 500);
  }

  const iterations = Number.parseInt(iterationsText, 10);

  if (!Number.isFinite(iterations) || iterations <= 0) {
    throw new AppError("Stored staff password hash iterations are invalid.", 500);
  }

  const computedHash = await derivePasswordHash(password.trim(), hexToBytes(saltHex), iterations);
  return bytesToHex(computedHash) === hashHex;
};
