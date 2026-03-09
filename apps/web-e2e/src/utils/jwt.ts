import { sign, type SignOptions } from 'jsonwebtoken';

/**
 * Dev-only fallback secret — matches apps/cli/src/commands/generateJwt.ts.
 * In CI, JWT_SECRET should be set as an env var.
 */
const DEV_JWT_SECRET = 'dev-jwt-secret-key-not-for-production-use-only';

/**
 * JWT generation utility for E2E tests.
 *
 * Signs JWTs directly using `jsonwebtoken` and the JWT_SECRET env var (or the
 * dev fallback). No CLI subprocess is spawned — this is fast, synchronous, and
 * works identically in CI and local environments.
 */
export class E2EJwtUtil {
  /**
   * Generate a JWT for E2E testing
   */
  static generateJwt(options: {
    email: string;
    expiration?: string;
    accessLevel?: 'none' | 'admin';
    id?: number;
  }): string {
    const { email, expiration = '1h', accessLevel = 'none', id = 1 } = options;
    const secret = process.env.JWT_SECRET || DEV_JWT_SECRET;

    return sign(
      {
        id,
        email,
        username: email.split('@')[0],
        accessLevel,
        iat: Math.floor(Date.now() / 1000),
      },
      secret,
      { algorithm: 'HS256', expiresIn: expiration as SignOptions['expiresIn'] },
    );
  }

  /**
   * Common test user configurations
   */
  static readonly TEST_USERS = {
    ADMIN: { email: 'admin@test.com', accessLevel: 'admin' as const },
    REGULAR_USER: { email: 'user@test.com', accessLevel: 'none' as const },
    LEAGUE_CREATOR: { email: 'creator@test.com', accessLevel: 'none' as const },
    PARTICIPANT: {
      email: 'participant@test.com',
      accessLevel: 'none' as const,
    },
  };

  /**
   * Generate JWTs for all common test scenarios
   */
  static generateTestJwts(expiration = '1h') {
    return {
      admin: E2EJwtUtil.generateJwt({
        ...E2EJwtUtil.TEST_USERS.ADMIN,
        expiration,
      }),
      regularUser: E2EJwtUtil.generateJwt({
        ...E2EJwtUtil.TEST_USERS.REGULAR_USER,
        expiration,
      }),
      leagueCreator: E2EJwtUtil.generateJwt({
        ...E2EJwtUtil.TEST_USERS.LEAGUE_CREATOR,
        expiration,
      }),
      participant: E2EJwtUtil.generateJwt({
        ...E2EJwtUtil.TEST_USERS.PARTICIPANT,
        expiration,
      }),
    };
  }

  /**
   * Validate JWT format (basic check)
   */
  static isValidJwtFormat(jwt: string): boolean {
    const jwtRegex = /^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
    return jwtRegex.test(jwt);
  }

  /**
   * Decode JWT payload for testing (without verification)
   */
  static decodeJwtPayload(jwt: string): Record<string, unknown> {
    const [, payload] = jwt.split('.');
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(decoded) as Record<string, unknown>;
  }
}

/**
 * Convenience functions for common use cases
 */
export const E2EAuth = {
  generateAdminJwt: (expiration?: string) =>
    E2EJwtUtil.generateJwt({ ...E2EJwtUtil.TEST_USERS.ADMIN, expiration }),

  generateUserJwt: (expiration?: string) =>
    E2EJwtUtil.generateJwt({
      ...E2EJwtUtil.TEST_USERS.REGULAR_USER,
      expiration,
    }),
};
