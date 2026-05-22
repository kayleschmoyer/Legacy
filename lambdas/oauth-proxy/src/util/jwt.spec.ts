import { decode, verify } from 'jsonwebtoken';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  readSecret: jest.fn().mockResolvedValue('test-secret'),
}));

import type { InternalUser } from '@legacy-sports/db-client';
import { createJwt } from './jwt';

describe('createJwt — algorithm pinning (LS-2544)', () => {
  const user = {
    id: 42,
    accessLevel: 'none',
    email: 'u@example.com',
    username: 'u',
    avatarUrl: null,
    passwordHash: null,
    privacyPolicyAcceptedAt: null,
    subscriptionTier: null,
    discordId: null,
    discordUsername: null,
    discordAvatar: null,
    googleId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as InternalUser;

  it('signs tokens with the HS256 algorithm', async () => {
    const token = await createJwt(user);
    const header = decode(token, { complete: true })?.header;
    expect(header?.alg).toBe('HS256');
  });

  it('verifies successfully under an HS256 allowlist', async () => {
    const token = await createJwt(user);
    expect(() =>
      verify(token, 'test-secret', { algorithms: ['HS256'] }),
    ).not.toThrow();
  });

  it("rejects a forged 'alg: none' token when verified with an algorithm allowlist", () => {
    // Hand-crafted unsigned JWT — header { alg: 'none', typ: 'JWT' }, no signature
    const header = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ id: 42, accessLevel: 'admin' }),
    ).toString('base64url');
    const forged = `${header}.${payload}.`;

    expect(() =>
      verify(forged, 'test-secret', { algorithms: ['HS256'] }),
    ).toThrow();
  });
});
