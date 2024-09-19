import { readSecret } from '@legacy-sports/utils';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Secret, SECRET_CONFIG } from '../util';

interface CookieValue {
  cipherText: string;
  iv: Buffer;
  tag: Buffer;
}

function encryptSymmetric(key: Buffer, plaintext: string): CookieValue {
  // create a random initialization vector
  const iv = randomBytes(12);

  // create a cipher object
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  // update the cipher object with the plaintext to encrypt
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');

  // finalize the encryption process
  ciphertext += cipher.final('base64');

  // retrieve the authentication tag for the encryption
  const tag = cipher.getAuthTag();

  return { cipherText: ciphertext, iv: iv, tag: tag };
}

function decryptSymmetric(key: Buffer, encryptedValue: CookieValue): string {
  const { tag, iv, cipherText } = encryptedValue;

  const decipher = createDecipheriv('aes-256-gcm', key, iv);

  decipher.setAuthTag(tag);

  let plaintext = decipher.update(cipherText, 'base64', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

async function getCookieKey(): Promise<Buffer> {
  const cookieKey = await readSecret(SECRET_CONFIG[Secret.COOKIE_SECRET]);
  return Buffer.from(cookieKey, 'base64');
}

export async function encryptCookies(
  cookies: Record<string, string | null | undefined>
): Promise<string> {
  const cookieKey = await getCookieKey();
  const parts: string[] = [];

  for (const [name, value] of Object.entries(cookies)) {
    const encryptedValue = !value ? '' : encryptSymmetric(cookieKey, value);
    parts.push(`${name}=${JSON.stringify(encryptedValue)}`);
  }

  parts.push('HttpOnly', 'Secure');
  return parts.join(';');
}

export async function decryptCookies(
  cookies: string
): Promise<Record<string, string | null | undefined>> {
  const cookieKey = await getCookieKey();

  const parts = cookies.split(';');
  const results: Record<string, string> = {};

  for (const part of parts) {
    const [name, value] = part.split('=');

    if (!value) {
      results[name] = '';
      continue;
    }

    const encryptedValue: CookieValue = JSON.parse(value) as CookieValue;
    const plaintextValue = decryptSymmetric(cookieKey, encryptedValue);

    results[name] = plaintextValue;
  }

  parts.push('HttpOnly', 'Secure');

  return results;
}
