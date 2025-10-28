import { execSync } from 'child_process';
import path from 'path';

/**
 * JWT generation utility for E2E tests
 * Uses the CLI generate-jwt command to create real, valid JWTs for testing
 */
export class E2EJwtUtil {
  private static readonly CLI_PATH = path.join(
    __dirname,
    '../../../cli/src/main.ts',
  );
  private static readonly CLI_COMMAND = `pnpm exec tsx --tsconfig tsconfig.base.json ${E2EJwtUtil.CLI_PATH}`;

  /**
   * Generate a JWT for E2E testing using the CLI command
   */
  static generateJwt(options: {
    email: string;
    expiration?: string;
    accessLevel?: 'none' | 'admin';
  }): string {
    const { email, expiration = '1h', accessLevel = 'none' } = options;

    try {
      const command = [
        E2EJwtUtil.CLI_COMMAND,
        'generate-jwt',
        '--email',
        email,
        '--exp',
        expiration,
        '--access-level',
        accessLevel,
      ].join(' ');

      console.log(
        `[E2E JWT] Generating JWT for ${email} with ${accessLevel} access (expires: ${expiration})`,
      );

      const output = execSync(command, {
        encoding: 'utf8',
        cwd: path.join(__dirname, '../../../..'), // Root of monorepo
        env: { ...process.env, NODE_ENV: 'test' },
      });

      // Extract JWT from CLI output (it's on the line after "🔑 JWT Token:")
      const jwtMatch = output.match(
        /🔑 JWT Token:\n(eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)/,
      );

      if (!jwtMatch?.[1]) {
        throw new Error('Failed to extract JWT from CLI output');
      }

      const jwt = jwtMatch[1];
      console.log(
        `[E2E JWT] ✅ Generated JWT for ${email}: ${jwt.substring(0, 20)}...`,
      );

      return jwt;
    } catch (error) {
      console.error(`[E2E JWT] ❌ Failed to generate JWT for ${email}:`, error);
      throw new Error(`Failed to generate JWT for E2E test: ${error}`);
    }
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
   * Create a Playwright page setup function with JWT authentication
   */
  static createAuthSetup(
    userType:
      | keyof typeof E2EJwtUtil.TEST_USERS
      | { email: string; accessLevel: 'none' | 'admin' },
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async (page: any) => {
      let jwt: string;

      if (typeof userType === 'string') {
        const config = E2EJwtUtil.TEST_USERS[userType];
        jwt = E2EJwtUtil.generateJwt(config);
      } else {
        jwt = E2EJwtUtil.generateJwt(userType);
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await page.addInitScript((token: string) => {
        window.localStorage.setItem('auth_jwt', token);
        console.log(
          '[E2E Auth] Set JWT in localStorage:',
          token.substring(0, 20) + '...',
        );
      }, jwt);

      return jwt;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static decodeJwtPayload(jwt: string): any {
    try {
      const [, payload] = jwt.split('.');
      const decoded = Buffer.from(payload, 'base64url').toString('utf8');
      return JSON.parse(decoded);
    } catch (error) {
      throw new Error(`Failed to decode JWT payload: ${error}`);
    }
  }
}

/**
 * Convenience functions for common use cases
 */
export const E2EAuth = {
  /**
   * Quick JWT generation for common scenarios
   */
  generateAdminJwt: (expiration?: string) =>
    E2EJwtUtil.generateJwt({ ...E2EJwtUtil.TEST_USERS.ADMIN, expiration }),

  generateUserJwt: (expiration?: string) =>
    E2EJwtUtil.generateJwt({
      ...E2EJwtUtil.TEST_USERS.REGULAR_USER,
      expiration,
    }),

  /**
   * Setup page with admin authentication
   */
  setupAdminAuth: E2EJwtUtil.createAuthSetup('ADMIN'),

  /**
   * Setup page with regular user authentication
   */
  setupUserAuth: E2EJwtUtil.createAuthSetup('REGULAR_USER'),

  /**
   * Setup page with custom user
   */
  setupCustomAuth: (email: string, accessLevel: 'none' | 'admin' = 'none') =>
    E2EJwtUtil.createAuthSetup({ email, accessLevel }),
};
