import { Argv, ArgumentsCamelCase } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import { CommandArgs } from '../utils/loadEnvFile';
import { runWithInternalClient, getUserByEmail } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { sign, SignOptions } from 'jsonwebtoken';

export interface GenerateJwtArgs extends CommandArgs {
  email: string;
  expiration?: string;
  accessLevel?: 'none' | 'admin';
  format?: 'token' | 'header' | 'env' | 'localstorage';
}

export const generateJwtCommandBuilder = (argv: Argv): Argv =>
  argv
    .option('email', {
      alias: 'e',
      describe: 'Email address of the user to generate JWT for',
      type: 'string',
      demandOption: true,
    })
    .option('expiration', {
      alias: 'exp',
      describe: 'JWT expiration time (e.g., "1h", "7d", "30d")',
      type: 'string',
      default: '7d',
    })
    .option('access-level', {
      alias: 'a',
      describe: 'User access level for the JWT',
      type: 'string',
      choices: ['none', 'admin'],
    })
    .option('format', {
      alias: 'f',
      describe: 'Output format for the JWT',
      type: 'string',
      choices: ['token', 'header', 'env', 'localstorage'],
      default: 'token',
    })
    .example([
      ['$0 generate-jwt --email user@example.com', 'Generate JWT for user with 7-day expiration'],
      ['$0 generate-jwt -e user@example.com --exp 1h', 'Generate JWT with 1-hour expiration'],
      ['$0 generate-jwt -e admin@example.com -a admin', 'Generate admin JWT'],
      ['$0 generate-jwt -e user@example.com -f header', 'Generate JWT as Authorization header JSON'],
      ['$0 generate-jwt -e user@example.com -f env', 'Generate JWT as environment variable'],
      ['$0 generate-jwt -e user@example.com -f localstorage', 'Generate JWT as localStorage command'],
    ]);

export const handleGenerateJwt = async (args: ArgumentsCamelCase<GenerateJwtArgs>): Promise<void> => {
  try {
    const { email, expiration, accessLevel, format } = args;
    
    LOGGER.info(`🔐 Generating JWT for user: ${email}`);
    
    let user: { id: number; email: string; username: string; accessLevel: string } | null = null;
    
    // Try to get user from database first
    try {
      const opts = getDbOptions();
      
      await runWithInternalClient(opts, async (dbClient) => {
        const dbUser = await getUserByEmail(dbClient, email);
        if (dbUser) {
          user = {
            id: dbUser.id,
            email: dbUser.email,
            username: dbUser.username || dbUser.email,
            accessLevel: dbUser.accessLevel || 'none',
          };
          LOGGER.info(`✅ Found user in database: ID ${user.id}, Email: ${user.email}`);
        }
      });
    } catch (dbError) {
      LOGGER.warn(`⚠️  Database not available: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      LOGGER.info('🔧 Falling back to mock user for development testing...');
    }
    
    // If no user found in database, create a mock user for development
    if (!user) {
      user = {
        id: 1,
        email: email,
        username: email.split('@')[0],
        accessLevel: accessLevel || 'none',
      };
      LOGGER.info(`🧪 Using mock user: ID ${user.id}, Email: ${user.email}`);
      LOGGER.info('⚠️  This is a development-only token - not connected to real user data');
    }
    
    // Get JWT secret
    const jwtSecret = await getJwtSecret();
    
    // Create JWT payload (same format as OAuth proxy)
    const payload = {
      id: user.id,
      email: user.email,
      username: user.username,
      accessLevel: accessLevel || user.accessLevel,
      iat: Math.floor(Date.now() / 1000),
    };
    
    // Sign JWT with expiration
    const jwtToken = sign(payload, jwtSecret, { expiresIn: expiration } as any);
    
    // Calculate expiration date for display
    const expirationDate = new Date();
    const expMs = parseExpiration(expiration || '7d');
    expirationDate.setTime(expirationDate.getTime() + expMs);
    
    // Output based on format
    switch (format) {
      case 'header':
        outputHeaderFormat(jwtToken);
        break;
      case 'env':
        outputEnvFormat(jwtToken);
        break;
      case 'localstorage':
        outputLocalStorageFormat(jwtToken);
        break;
      case 'token':
      default:
        outputTokenFormat(jwtToken, user, payload, expirationDate);
        break;
    }
    
  } catch (error) {
    LOGGER.error('❌ Error generating JWT:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
};

/**
 * Output JWT as Authorization header JSON
 */
function outputHeaderFormat(jwtToken: string): void {
  const headerJson = {
    "Authorization": `Bearer ${jwtToken}`
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
  user: { id: number; email: string; username: string; accessLevel: string }, 
  payload: any, 
  expirationDate: Date
): void {
  LOGGER.info('\n🎉 JWT Generated Successfully!');
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

/**
 * Get JWT secret using same method as OAuth proxy
 */
async function getJwtSecret(): Promise<string> {
  try {
    // For development, use a simple secret
    // In production, this would read from AWS Secrets Manager
    const secret = process.env.JWT_SECRET || 'dev-jwt-secret-key-not-for-production-use-only';
    
    if (secret === 'dev-jwt-secret-key-not-for-production-use-only') {
      LOGGER.warn('⚠️  Using development JWT secret. Do not use in production!');
    }
    
    return secret;
  } catch (error) {
    LOGGER.warn('⚠️  Could not load JWT secret from environment, using development secret');
    return 'dev-jwt-secret-key-not-for-production-use-only';
  }
}

/**
 * Parse expiration string to milliseconds
 */
function parseExpiration(exp: string): number {
  const units: Record<string, number> = {
    's': 1000,
    'm': 60 * 1000,
    'h': 60 * 60 * 1000,
    'd': 24 * 60 * 60 * 1000,
  };
  
  const match = exp.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid expiration format: ${exp}. Use format like "1h", "7d", "30m"`);
  }
  
  const [, amount, unit] = match;
  return parseInt(amount, 10) * units[unit];
}
