import { LOGGER } from '@legacy-sports/logging';
import { CLIAuthService } from '../services/AuthService';
import { CommandArgs } from '../utils/loadEnvFile';
import { JWTPayload, User } from '../types/cli-types';

export interface GenerateJwtArgs extends CommandArgs {
  format?: 'token' | 'header' | 'env' | 'localstorage';
}

export const handleGenerateJwt = async (
  args: GenerateJwtArgs,
): Promise<void> => {
  try {
    const { format } = args;
    const authService = new CLIAuthService();

    // Authenticate via device flow if not already logged in
    if (!(await authService.isAuthenticated())) {
      LOGGER.info(
        '🔐 Not authenticated. Starting device flow authentication...',
      );
      await authService.authenticate();
    } else {
      LOGGER.info('✅ Using existing authentication session.');
    }

    const jwt = await authService.getAuthToken();
    if (!jwt) {
      throw new Error('Authentication succeeded but no token was retrieved');
    }

    // Decode JWT payload for display info (no verification — we trust our stored tokens)
    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1], 'base64').toString(),
    ) as JWTPayload;

    const expirationDate = payload.exp
      ? new Date(payload.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const user: User = {
      id: payload.id,
      email: payload.email,
      username: payload.username,
      accessLevel: payload.accessLevel,
    };

    // Output based on format
    switch (format) {
      case 'header':
        outputHeaderFormat(jwt);
        break;
      case 'env':
        outputEnvFormat(jwt);
        break;
      case 'localstorage':
        outputLocalStorageFormat(jwt);
        break;
      case 'token':
      default:
        outputTokenFormat(jwt, user, payload, expirationDate);
        break;
    }
  } catch (error) {
    LOGGER.error(
      '❌ Error generating JWT:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
};

/**
 * Output JWT as Authorization header JSON
 */
function outputHeaderFormat(jwtToken: string): void {
  const headerJson = {
    Authorization: `Bearer ${jwtToken}`,
  };
  console.log(JSON.stringify(headerJson, null, 2));
}

/**
 * Output JWT as environment variable
 */
function outputEnvFormat(jwtToken: string): void {
  console.log(`export AUTH_JWT="${jwtToken}"`);
}

/**
 * Output JWT as localStorage command
 */
function outputLocalStorageFormat(jwtToken: string): void {
  console.log(`localStorage.setItem('auth_jwt', '${jwtToken}');`);
}

/**
 * Output JWT with full details (default format)
 */
function outputTokenFormat(
  jwtToken: string,
  user: User,
  payload: JWTPayload,
  expirationDate: Date,
): void {
  LOGGER.info('\n🎉 JWT Retrieved Successfully!');
  LOGGER.info('================================');
  LOGGER.info(`User: ${user.email} (ID: ${user.id})`);
  LOGGER.info(`Access Level: ${payload.accessLevel}`);
  LOGGER.info(`Expires: ${expirationDate.toISOString()}`);
  LOGGER.info(`\n🔑 JWT Token:`);
  console.log(jwtToken);

  LOGGER.info('\n💡 Usage Examples:');
  LOGGER.info('  • Set as environment variable:');
  LOGGER.info(`    export AUTH_JWT="${jwtToken}"`);
  LOGGER.info('  • Use in HTTP Authorization header:');
  LOGGER.info(`    Authorization: Bearer ${jwtToken}`);
  LOGGER.info('  • Store in localStorage for web testing:');
  LOGGER.info(`    localStorage.setItem('auth_jwt', '${jwtToken}')`);
  LOGGER.info('  • Copy to E2E test auth fixture:');
  LOGGER.info(`    window.localStorage.setItem('auth_jwt', '${jwtToken}')`);
}
