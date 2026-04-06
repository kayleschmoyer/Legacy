import { LOGGER } from '@legacy-sports/logging';
import { execFileSync, spawn } from 'child_process';
import { CLIAuthService } from '../services/AuthService';
import { CommandArgs } from '../utils/loadEnvFile';

export interface AuthCommandArgs extends CommandArgs {
  action: 'login' | 'logout' | 'status' | 'switch' | 'list';
  user?: string;
  all?: boolean;
  dbTunnel?: boolean;
  localPort?: number;
  profile?: string;
}

export const handleAuth = async (args: AuthCommandArgs): Promise<void> => {
  const authService = new CLIAuthService();

  try {
    switch (args.action) {
      case 'login':
        await handleLogin(authService, args);
        break;

      case 'logout':
        await handleLogout(authService, args);
        break;

      case 'status':
        await handleStatus(authService);
        break;

      case 'switch':
        await handleSwitch(authService, args);
        break;

      case 'list':
        await handleList(authService);
        break;

      default:
        throw new Error(`Unknown action: ${String(args.action)}`);
    }
  } catch (error) {
    LOGGER.error(
      `Auth ${String(args.action)} failed:`,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
};

/**
 * Handle login command — AWS SSO auth with optional DB tunnel.
 */
async function handleLogin(
  authService: CLIAuthService,
  args: AuthCommandArgs,
): Promise<void> {
  const profile = args.profile;
  const dbTunnel = args.dbTunnel !== false; // defaults to true

  // Step 1 — AWS SSO authentication
  LOGGER.info('Checking AWS authentication...');
  if (!isAwsAuthenticated(profile)) {
    LOGGER.info('AWS session expired or not authenticated.');
    runSsoLogin(profile);

    if (!isAwsAuthenticated(profile)) {
      throw new Error('AWS SSO login failed. Please try again.');
    }
  }
  LOGGER.info('AWS authentication confirmed.');

  // Step 2 — App-level authentication (existing OAuth flow)
  await authService.authenticate();

  // Step 3 — DB tunnel (on by default)
  if (dbTunnel) {
    await startDbTunnel(args.localPort, profile);
  }
}

/**
 * Handle logout command
 */
async function handleLogout(
  authService: CLIAuthService,
  args: AuthCommandArgs,
): Promise<void> {
  if (args.all) {
    const users = await authService.listUsers();
    if (users.length === 0) {
      LOGGER.info('No users are currently authenticated');
      return;
    }

    const proceed = promptYesNo(
      `Logout all ${users.length} authenticated user(s)?`,
    );
    if (!proceed) {
      LOGGER.info('Logout cancelled');
      return;
    }

    await authService.logout();
    LOGGER.info('✅ All users logged out');
  } else if (args.user) {
    const users = await authService.listUsers();
    if (!users.includes(args.user)) {
      throw new Error(`User ${args.user} is not authenticated`);
    }

    await authService.logout(args.user);
    LOGGER.info(`✅ User ${args.user} logged out`);
  } else {
    // Logout current user
    const currentUser = await authService.getCurrentUser();
    if (!currentUser) {
      LOGGER.info('No user is currently authenticated');
      return;
    }

    const proceed = promptYesNo(`Logout user ${currentUser.email}?`);
    if (!proceed) {
      LOGGER.info('Logout cancelled');
      return;
    }

    await authService.logout(currentUser.email);
    LOGGER.info(`✅ User ${currentUser.email} logged out`);
  }
}

/**
 * Handle status command
 */
async function handleStatus(authService: CLIAuthService): Promise<void> {
  const currentUser = await authService.getCurrentUser();
  const allUsers = await authService.listUsers();

  if (!currentUser) {
    LOGGER.info('❌ Not authenticated');
    if (allUsers.length > 0) {
      LOGGER.info(
        `Found ${allUsers.length} stored authentication(s), but none are current:`,
      );
      allUsers.forEach((email) => LOGGER.info(`  • ${email}`));
      LOGGER.info('Run "cli auth switch --user <email>" to switch users');
    }
    return;
  }

  LOGGER.info('✅ Authentication Status');
  LOGGER.info(`Current User: ${currentUser.email}`);
  LOGGER.info(`Access Level: ${currentUser.accessLevel}`);

  if (allUsers.length > 1) {
    LOGGER.info('\nOther authenticated users:');
    allUsers
      .filter((email) => email !== currentUser.email)
      .forEach((email) => LOGGER.info(`  • ${email}`));
  }
}

/**
 * Handle switch command
 */
async function handleSwitch(
  authService: CLIAuthService,
  args: AuthCommandArgs,
): Promise<void> {
  if (!args.user) {
    // Interactive switch - show available users
    const users = await authService.listUsers();
    if (users.length === 0) {
      throw new Error(
        'No authenticated users found. Run "cli auth login" first.',
      );
    }

    if (users.length === 1) {
      throw new Error(
        'Only one user authenticated. Use "cli auth login" to add another user.',
      );
    }

    LOGGER.info('Available users:');
    users.forEach((email, index) => LOGGER.info(`  ${index + 1}. ${email}`));

    // For now, just show the list. In a full implementation, you'd add interactive selection
    LOGGER.info('\nUse: cli auth switch --user <email>');
    return;
  }

  await authService.switchUser(args.user);
  LOGGER.info(`✅ Switched to user: ${args.user}`);
}

/**
 * Handle list command
 */
async function handleList(authService: CLIAuthService): Promise<void> {
  const users = await authService.listUsers();
  const currentUser = await authService.getCurrentUser();

  if (users.length === 0) {
    LOGGER.info('No authenticated users found');
    return;
  }

  LOGGER.info(`📋 Authenticated Users (${users.length}):`);

  for (const email of users) {
    const isCurrent = currentUser?.email === email;
    const marker = isCurrent ? ' (current)' : '';
    LOGGER.info(`  • ${email}${marker}`);
  }
}

/**
 * Simple yes/no prompt (would normally use a proper CLI prompt library)
 */
function promptYesNo(message: string): boolean {
  // For now, just return true. In a full implementation, you'd use
  // a library like 'inquirer' or 'prompts' for interactive CLI prompts
  LOGGER.info(`${message} (assuming yes for CLI operation)`);
  return true;
}

// ─── AWS SSO + DB Tunnel helpers ────────────────────────────────────────────

function isAwsCliMissing(err: unknown): boolean {
  return (
    err != null &&
    typeof err === 'object' &&
    'code' in err &&
    err.code === 'ENOENT'
  );
}

const AWS_CLI_NOT_FOUND =
  'AWS CLI not found. Install it from https://aws.amazon.com/cli/ and ensure "aws" is on your PATH.';

function isAwsAuthenticated(profile?: string): boolean {
  try {
    const args = ['sts', 'get-caller-identity'];
    if (profile) {
      args.push('--profile', profile);
    }
    execFileSync('aws', args, { stdio: 'pipe' });
    return true;
  } catch (err) {
    if (isAwsCliMissing(err)) {
      throw new Error(AWS_CLI_NOT_FOUND);
    }
    return false;
  }
}

function runSsoLogin(profile?: string): void {
  const args = ['sso', 'login'];
  if (profile) {
    args.push('--profile', profile);
  }
  LOGGER.info('Opening AWS SSO login — complete the flow in your browser...');
  try {
    execFileSync('aws', args, { stdio: 'inherit' });
  } catch (err) {
    if (isAwsCliMissing(err)) {
      throw new Error(AWS_CLI_NOT_FOUND);
    }
    throw err;
  }
}

function getNatInstanceId(profile?: string): string {
  const args = [
    'ec2',
    'describe-instances',
    '--filters',
    'Name=tag:Name,Values=*-nat-instance',
    'Name=instance-state-name,Values=running',
    '--query',
    'Reservations[0].Instances[0].InstanceId',
    '--output',
    'text',
  ];
  if (profile) {
    args.push('--profile', profile);
  }

  let result: string;
  try {
    result = execFileSync('aws', args, { stdio: 'pipe' }).toString().trim();
  } catch (err) {
    if (isAwsCliMissing(err)) {
      throw new Error(AWS_CLI_NOT_FOUND);
    }
    throw err;
  }
  if (!result || result === 'None') {
    throw new Error(
      'Could not find a running NAT instance. Ensure your infrastructure is deployed with use_nat_instance = true.',
    );
  }
  return result;
}

function getRdsHost(): string {
  const raw = process.env.DB_HOST_DIRECT || process.env.DB_HOST;
  if (!raw) {
    throw new Error(
      'DB_HOST_DIRECT or DB_HOST must be set in your environment (.env / .env.local).',
    );
  }
  // Strip any :port suffix — SSM port-forwarding takes the port separately
  return raw.split(':')[0];
}

async function startDbTunnel(
  localPort = 5432,
  profile?: string,
): Promise<void> {
  if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) {
    throw new Error(
      `Invalid local port "${String(localPort)}". Expected an integer between 1 and 65535.`,
    );
  }

  LOGGER.info('Looking up NAT instance...');
  const instanceId = getNatInstanceId(profile);
  LOGGER.info(`NAT instance: ${instanceId}`);

  const rdsHost = getRdsHost();
  LOGGER.info(`RDS host: ${rdsHost}`);

  LOGGER.info(
    `Starting SSM tunnel: localhost:${localPort} → ${rdsHost}:5432 (via ${instanceId})`,
  );
  LOGGER.info('Press Ctrl+C to close the tunnel.\n');

  const ssmArgs = [
    'ssm',
    'start-session',
    '--target',
    instanceId,
    '--document-name',
    'AWS-StartPortForwardingSessionToRemoteHost',
    '--parameters',
    JSON.stringify({
      host: [rdsHost],
      portNumber: ['5432'],
      localPortNumber: [String(localPort)],
    }),
  ];
  if (profile) {
    ssmArgs.push('--profile', profile);
  }

  const child = spawn('aws', ssmArgs, { stdio: 'inherit' });

  const onSignal = () => {
    child.kill('SIGINT');
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  return new Promise<void>((resolve, reject) => {
    child.on('close', (code) => {
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      if (code === 0 || code === null) {
        LOGGER.info('SSM tunnel closed.');
        resolve();
      } else {
        reject(new Error(`SSM session exited with code ${code}`));
      }
    });
    child.on('error', (err) => {
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      if ('code' in err && err.code === 'ENOENT') {
        reject(new Error(AWS_CLI_NOT_FOUND));
      } else {
        reject(
          new Error(
            `Failed to start SSM session: ${err.message}. ` +
              'Ensure the Session Manager plugin is installed.',
          ),
        );
      }
    });
  });
}
