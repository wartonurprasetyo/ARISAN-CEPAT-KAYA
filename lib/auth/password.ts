import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

// Same cost as the hashes already stored in app_users.
const COST = 12;
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/** Why a new password is rejected, or null when it is acceptable. */
export function newPasswordError(password: string) {
  if (password.length < 12) return "Password harus memiliki minimal 12 karakter.";
  // bcrypt silently ignores everything past 72 bytes.
  if (bcrypt.truncates(password)) return "Password terlalu panjang (maksimal 72 byte).";
  return null;
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, COST);
}

let dummyHash: Promise<string> | undefined;

export async function verifyPassword(
  hash: string | null | undefined,
  password: string,
) {
  const usable = typeof hash === "string" && BCRYPT_HASH.test(hash);
  // A missing or unusable hash still costs one verification, so response time
  // does not reveal whether the account exists.
  const target = usable
    ? hash
    : await (dummyHash ??= hashPassword(randomBytes(32).toString("hex")));

  try {
    const matches = await bcrypt.compare(password, target);
    return usable && matches;
  } catch (error) {
    console.error("Password verification failed", error);
    return false;
  }
}
