import { compare, genSalt, hash } from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  const salt = await genSalt(SALT_ROUNDS);
  const hashedValue = await hash(plaintext, salt);
  return hashedValue;
}

export async function testPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return await compare(plaintext, hash);
}
