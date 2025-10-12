import { ArgumentsCamelCase, Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import { CLIAuthService } from '../services/AuthService';
import { CommandArgs } from '../utils/loadEnvFile';

export interface AuthCommandArgs extends CommandArgs {
  action: 'login' | 'logout' | 'status' | 'switch' | 'list';
  user?: string;
  all?: boolean;
}

export const authCommandBuilder = (argv: Argv): Argv =>
  argv
    .positional('action', {
      describe: 'Authentication action to perform',
      type: 'string',
      choices: ['login', 'logout', 'status', 'switch', 'list'],
      demandOption: true,
    })
    .option('user', {
      alias: 'u',
      describe: 'Specific user email to target',
      type: 'string',
    })
    .option('all', {
      alias: 'a',
      describe: 'Apply action to all users (logout only)',
      type: 'boolean',
      default: false,
    })
    .example([
      ['$0 auth login', 'Start OAuth login flow'],
      ['$0 auth status', 'Check current authentication status'],
      ['$0 auth list', 'List all authenticated users'],
      ['$0 auth switch --user user@example.com', 'Switch to a different user'],
      ['$0 auth logout', 'Logout current user'],
      ['$0 auth logout --all', 'Logout all users'],
      ['$0 auth logout --user user@example.com', 'Logout specific user'],
    ]);

export const handleAuth = async (args: ArgumentsCamelCase<AuthCommandArgs>): Promise<void> => {
  const authService = new CLIAuthService();

  try {
    switch (args.action) {
      case 'login':
        await handleLogin(authService);
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
    LOGGER.error(`Auth ${String(args.action)} failed:`, error instanceof Error ? error.message : String(error));
    throw error;
  }
};

/**
 * Handle login command
 */
async function handleLogin(authService: CLIAuthService): Promise<void> {
  LOGGER.info('🔐 Starting CLI authentication...');
  
  // Check if already authenticated
  if (await authService.isAuthenticated()) {
    const currentUser = await authService.getCurrentUser();
    const proceed = promptYesNo(`Already authenticated as ${currentUser?.email}. Login as different user?`);
    
    if (!proceed) {
      LOGGER.info('Authentication cancelled');
      return;
    }
  }

  await authService.authenticate();
}

/**
 * Handle logout command
 */
async function handleLogout(authService: CLIAuthService, args: AuthCommandArgs): Promise<void> {
  if (args.all) {
    const users = await authService.listUsers();
    if (users.length === 0) {
      LOGGER.info('No users are currently authenticated');
      return;
    }

    const proceed = promptYesNo(`Logout all ${users.length} authenticated user(s)?`);
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
      LOGGER.info(`Found ${allUsers.length} stored authentication(s), but none are current:`);
      allUsers.forEach(email => LOGGER.info(`  • ${email}`));
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
      .filter(email => email !== currentUser.email)
      .forEach(email => LOGGER.info(`  • ${email}`));
  }
}

/**
 * Handle switch command
 */
async function handleSwitch(authService: CLIAuthService, args: AuthCommandArgs): Promise<void> {
  if (!args.user) {
    // Interactive switch - show available users
    const users = await authService.listUsers();
    if (users.length === 0) {
      throw new Error('No authenticated users found. Run "cli auth login" first.');
    }

    if (users.length === 1) {
      throw new Error('Only one user authenticated. Use "cli auth login" to add another user.');
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
