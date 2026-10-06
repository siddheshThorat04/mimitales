import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended minimum parameters. The algorithm defaults to Argon2id.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

// Verified against when the email doesn't exist, so response time doesn't reveal it.
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword("not-a-real-password-used-for-timing-only");
  return dummy;
}