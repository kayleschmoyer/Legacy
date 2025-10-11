import { ArgumentsCamelCase, Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import { DraftService } from '@legacy-sports/db-client';
import { CommandArgs } from '../utils/loadEnvFile';
import { AuthMiddleware } from '../services/AuthMiddleware';
import { User } from '../types/cli-types';

export interface StartDraftArgs extends CommandArgs {
  leagueId: number;
  draftType?: 'random-draft' | 'snake-draft' | 'auction';
  user?: string;
  skipUserValidation?: boolean;
  dryRun?: boolean;
}

export const startDraftCommandBuilder = (argv: Argv): Argv =>
  argv
    .option('leagueId', {
      alias: 'l',
      type: 'number',
      describe: 'League ID to start draft for',
      demandOption: true,
    })
    .option('draftType', {
      alias: 't',
      type: 'string',
      describe: 'Type of draft to start',
      choices: ['random-draft', 'snake-draft', 'auction'],
      default: 'random-draft',
    })
    .option('user', {
      alias: 'u',
      type: 'string',
      describe: 'Email of user to authenticate as (if multiple users)',
    })
    .option('skipUserValidation', {
      type: 'boolean',
      describe: 'Skip user access validation (admin operation)',
      default: false,
    })
    .option('dryRun', {
      type: 'boolean',
      describe: 'Show what would happen without actually starting the draft',
      default: false,
    })
    .example([
      ['$0 start-draft --leagueId 1', 'Start random draft for league 1'],
      ['$0 start-draft -l 1 -t snake-draft', 'Start snake draft for league 1'],
      ['$0 start-draft -l 1 --user admin@example.com', 'Start draft as specific user'],
      ['$0 start-draft -l 1 --skipUserValidation', 'Start draft without user validation (admin)'],
      ['$0 start-draft -l 1 --dryRun', 'Preview draft start without executing'],
    ])
    .check((argv) => {
      if (argv.leagueId <= 0) {
        throw new Error('League ID must be a positive integer');
      }
      return true;
    });

export async function handleStartDraft(
  args: ArgumentsCamelCase<StartDraftArgs>,
): Promise<void> {
  const { leagueId, draftType = 'random-draft', user, skipUserValidation, dryRun } = args;

  try {
    LOGGER.info(`🎯 Starting draft for league ${leagueId}`);
    LOGGER.info(`📋 Draft Type: ${draftType}`);
    
    if (dryRun) {
      LOGGER.info('🧪 DRY RUN MODE - No changes will be made');
    }

    // Get authenticated user
    const authMiddleware = new AuthMiddleware();
    let currentUser: User;
    
    try {
      // Try to get the current user 
      const authUser = await authMiddleware.getCurrentUser();
      if (!authUser) {
        throw new Error('No authenticated user found');
      }
      
      // For CLI operations, we need to create a user object with ID
      // We'll use a mock ID since the JWT doesn't contain the database ID
      currentUser = {
        id: 1, // Mock ID for CLI operations
        email: authUser.email,
        username: authUser.email.split('@')[0],
        accessLevel: authUser.accessLevel
      };
      
      LOGGER.info(`🔐 Authenticated as: ${currentUser.email}`);
      LOGGER.info(`🎫 Access Level: ${currentUser.accessLevel}`);
    } catch (authError) {
      if (skipUserValidation) {
        LOGGER.warn('⚠️  Authentication failed but skipUserValidation is enabled');
        // Create a mock admin user for the operation
        currentUser = {
          id: 1,
          email: user || 'admin@legacy-sports.com',
          username: 'admin',
          accessLevel: 'admin'
        };
        LOGGER.info(`🔧 Using mock admin user: ${currentUser.email}`);
      } else {
        LOGGER.error('❌ Authentication required to start draft');
        LOGGER.info('💡 Run "cli auth login" to authenticate, or use --skipUserValidation for admin operations');
        throw authError;
      }
    }

    // Create draft service
    const draftService = new DraftService();
    
    // Check configuration
    const config = draftService.getConfiguration();
    LOGGER.info('\n🔧 Draft Service Configuration:');
    LOGGER.info(`   Queue URL: ${config.queueUrl ? '✅ Configured' : '❌ Not configured'}`);
    LOGGER.info(`   SQS Service: ${config.sqsServiceAvailable ? '✅ Available' : '❌ Not available'}`);
    
    if (!config.sqsServiceAvailable) {
      LOGGER.error('❌ Draft queue not configured - check SQS_AUTOMATIC_DRAFTS_URL environment variable');
      if (!dryRun) {
        throw new Error('Draft queue URL not configured');
      }
    }

    // In dry run mode, just show what would happen
    if (dryRun) {
      LOGGER.info('\n📋 DRY RUN - Would perform the following actions:');
      LOGGER.info(`   1. Validate draft type: ${draftType}`);
      
      if (!skipUserValidation) {
        LOGGER.info(`   2. Verify user ${currentUser.id} has access to league ${leagueId}`);
      } else {
        LOGGER.info(`   2. Skip user access validation (admin override)`);
      }
      
      LOGGER.info(`   3. Update league ${leagueId} draft status to 'queued'`);
      LOGGER.info(`   4. Send SQS message to trigger draft processing`);
      LOGGER.info(`   5. Return updated league details`);
      
      // Try to get current league status
      try {
        const status = await draftService.getDraftStatus(leagueId);
        LOGGER.info(`\n📊 Current league status: ${status.draftStatus}`);
      } catch (error) {
        LOGGER.warn(`⚠️  Could not get current league status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      LOGGER.info('\n✅ DRY RUN completed - use without --dryRun to execute');
      return;
    }

    // Execute the draft start
    LOGGER.info('\n🚀 Executing draft start...');
    
    const result = await draftService.startDraft({
      leagueId,
      draftType,
      requestedBy: currentUser.id,
      validateUserAccess: !skipUserValidation,
    });

    // Display results
    if (result.success) {
      LOGGER.info('\n✅ DRAFT STARTED SUCCESSFULLY!');
      LOGGER.info('='.repeat(50));
      LOGGER.info(`🏟️  League: ${result.league.name} (ID: ${result.league.id})`);
      LOGGER.info(`📊 Status: ${result.league.draftStatus}`);
      LOGGER.info(`👤 Owner: ${result.league.owner}`);
      LOGGER.info(`👥 Max Roster: ${result.league.maxRosterSize}`);
      LOGGER.info(`💬 Message: ${result.message}`);
      
      LOGGER.info('\n🎯 Next Steps:');
      LOGGER.info('   • Draft processing has been queued and will start automatically');
      LOGGER.info('   • Monitor draft progress with: npm run cli:inspect-sqs-queue');
      LOGGER.info('   • Check league status with GraphQL queries or web interface');
      
    } else {
      LOGGER.error('\n❌ DRAFT START FAILED!');
      LOGGER.error('='.repeat(50));
      LOGGER.error(`🏟️  League ID: ${leagueId}`);
      LOGGER.error(`📊 Current Status: ${result.league.draftStatus}`);
      LOGGER.error(`💬 Message: ${result.message}`);
      if (result.error) {
        LOGGER.error(`🚨 Error: ${result.error}`);
      }
      
      LOGGER.info('\n🔧 Troubleshooting:');
      LOGGER.info('   • Verify league exists and you have access');
      LOGGER.info('   • Check that SQS_AUTOMATIC_DRAFTS_URL is configured');
      LOGGER.info('   • Ensure AWS credentials are valid');
      LOGGER.info('   • Try with --dryRun to test configuration');
      
      process.exit(1);
    }

  } catch (error) {
    LOGGER.error('\n💥 UNEXPECTED ERROR!');
    LOGGER.error('='.repeat(50));
    
    if (error instanceof Error) {
      if (error.message.includes('Authentication required') || error.message.includes('Authentication token is invalid')) {
        LOGGER.error('🔑 Authentication Error');
        LOGGER.info('💡 Solutions:');
        LOGGER.info('   • Run "cli auth login" to authenticate');
        LOGGER.info('   • Use --user <email> to specify a user');
        LOGGER.info('   • Use --skipUserValidation for admin operations');
      } else if (error.message.includes('User does not have access')) {
        LOGGER.error('🚫 Access Denied');
        LOGGER.info('💡 Solutions:');
        LOGGER.info('   • Verify you are a member of this league');
        LOGGER.info('   • Use --skipUserValidation for admin operations');
        LOGGER.info('   • Check the league ID is correct');
      } else if (error.message.includes('Draft queue URL not configured')) {
        LOGGER.error('🔧 Configuration Error');
        LOGGER.info('💡 Solutions:');
        LOGGER.info('   • Set SQS_AUTOMATIC_DRAFTS_URL environment variable');
        LOGGER.info('   • Run npm run sync-env to update environment');
        LOGGER.info('   • Check AWS infrastructure is deployed');
      } else {
        LOGGER.error(`🚨 Error: ${error.message}`);
      }
      
      if (error.stack && process.env.DEBUG) {
        LOGGER.error('\n📝 Stack Trace (DEBUG mode):');
        LOGGER.error(error.stack);
      }
    } else {
      LOGGER.error('🚨 Unknown error occurred');
      LOGGER.error(String(error));
    }
    
    LOGGER.info('\n💡 General Troubleshooting:');
    LOGGER.info('   • Use --dryRun to test without making changes');
    LOGGER.info('   • Check environment with: npm run cli:test-connection');
    LOGGER.info('   • Inspect SQS queue with: npm run cli:inspect-sqs-queue');
    LOGGER.info('   • Set DEBUG=* for verbose logging');
    
    process.exit(1);
  }
}