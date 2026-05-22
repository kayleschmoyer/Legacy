import { LOGGER } from '@legacy-sports/logging';
import { CLIAuthService } from '../services/AuthService';
import { CommandArgs } from '../utils/loadEnvFile';
import { JWTPayload, User } from '../types/cli-types';

export interface GenerateJwtArgs extends CommandArgs {
  reveal?: boolean;
  logFile?: string;
}

export interface GenerateJwtDeps {
  authService?: Pick<
    CLIAuthService,
    'isAuthenticated' | 'authenticate' | 'getAuthToken'
  >;
  stdout?: NodeJS.WritableStream;
  exit?: (code: number) => never;
}

export const handleGenerateJwt = async (
  args: GenerateJwtArgs,
  deps: GenerateJwtDeps = {},
): Promise<void> => {
  const stdout = deps.stdout ?? process.stdout;
  const exit = deps.exit ?? ((code: number) => process.exit(code));

  try {
    // --reveal cannot be combined with --log-file. Refuse before authenticating so
    // the user isn't prompted through a device-flow for a command that will refuse.
    if (args.reveal && args.logFile) {
      LOGGER.error(
        '❌ --reveal cannot be combined with --log-file: that would persist the JWT to disk.',
      );
      LOGGER.error(
        '   Re-run without --log-file, or omit --reveal to see metadata only.',
      );
      exit(1);
      return;
    }

    const authService = deps.authService ?? new CLIAuthService();

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

    // Decode JWT payload for metadata display (no verification — we trust our stored tokens)
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

    printMetadata(user, payload, expirationDate);

    if (!args.reveal) {
      LOGGER.info('');
      LOGGER.info(
        '🔒 Token withheld. Re-run with --reveal to print it once on stdout (incompatible with --log-file).',
      );
      return;
    }

    // Write the raw token directly to stdout — bypass LOGGER so no FileOutputDestination
    // can capture it. Exactly one write, no surrounding prose.
    stdout.write(`${jwt}\n`);
  } catch (error) {
    LOGGER.error(
      '❌ Error generating JWT:',
      error instanceof Error ? error : new Error(String(error)),
    );
    exit(1);
  }
};

function printMetadata(
  user: User,
  payload: JWTPayload,
  expirationDate: Date,
): void {
  LOGGER.info('\n🎉 JWT Retrieved Successfully!');
  LOGGER.info('================================');
  LOGGER.info(`User: ${user.email} (ID: ${user.id})`);
  LOGGER.info(`Username: ${user.username}`);
  LOGGER.info(`Access Level: ${payload.accessLevel}`);
  LOGGER.info(`Expires: ${expirationDate.toISOString()}`);
  if (payload.iat) {
    LOGGER.info(`Issued At: ${new Date(payload.iat * 1000).toISOString()}`);
  }
}
