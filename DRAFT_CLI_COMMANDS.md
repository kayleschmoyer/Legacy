# Draft Management CLI Commands

This document outlines the new CLI commands for managing drafts in the Legacy Sports application.

## Overview

A new **shared DraftService** has been implemented to provide consistent draft management across all parts of the application:

- ✅ **CLI Commands** for manual draft operations
- ✅ **GraphQL Mutations** for web/mobile interfaces  
- ✅ **Test Scripts** for automated testing

## Common Code Extraction

The following common draft logic has been extracted into a reusable `DraftService`:

### Key Features
- **User Access Validation** - Ensures users have permission to start drafts
- **Draft Type Validation** - Validates supported draft types (`random-draft`, `snake-draft`, `auction`)
- **SQS Integration** - Handles message queuing for async draft processing
- **Database Transactions** - Manages draft status updates with rollback on failure
- **Error Handling** - Comprehensive error handling and logging

### Components Refactored
- `lambdas/db/src/schema/leagues.ts` - GraphQL `startDraft` mutation now uses shared service
- `lib/utils/src/lib/DraftService.ts` - New shared service containing extracted logic
- `apps/cli/src/commands/startDraft.ts` - New CLI command using shared service

## CLI Commands

### Start Draft Command

**Basic Usage:**
```bash
# Start a random draft for league 1
npm run cli:start-draft -- --leagueId 1

# Alternative short syntax
npm run draft:start -- --leagueId 1
```

**Advanced Usage:**
```bash
# Start a snake draft
npm run draft:start -- --leagueId 1 --draftType snake-draft

# Start draft as specific user
npm run draft:start -- --leagueId 1 --user admin@example.com

# Admin override (skip user validation)
npm run draft:start -- --leagueId 1 --skipUserValidation

# Preview without executing
npm run draft:start -- --leagueId 1 --dryRun
```

**Available Options:**
- `--leagueId` / `-l` - League ID (required)
- `--draftType` / `-t` - Draft type: `random-draft` (default), `snake-draft`, `auction`
- `--user` / `-u` - Email of user to authenticate as
- `--skipUserValidation` - Skip user access validation (admin operation)
- `--dryRun` - Show what would happen without executing

### Draft Queue Management

**Inspect Draft Queue:**
```bash
# View queue status and message counts
npm run draft:inspect

# Peek at messages without consuming them
npm run draft:inspect -- --action peek

# List and consume messages for detailed inspection
npm run draft:inspect -- --action list --maxMessages 5
```

## Authentication

### Automatic Authentication
The CLI will automatically use your stored authentication:

```bash
# Login first (if not already authenticated)
npx nx auth cli login

# Then run draft commands normally
npm run draft:start -- --leagueId 1
```

### Manual User Specification
```bash
# Specify a different authenticated user
npm run draft:start -- --leagueId 1 --user admin@example.com
```

### Admin Operations
```bash
# Skip user validation for admin operations
npm run draft:start -- --leagueId 1 --skipUserValidation
```

## Draft Flow

The draft process follows this flow:

1. **Validation** - Validate draft type and user access
2. **Database Update** - Set league status to `queued`  
3. **SQS Message** - Send message to draft processing queue
4. **Lambda Processing** - Draft processor handles the actual drafting
5. **Status Updates** - Automatic progression: `queued` → `in-progress` → `completed`

## Error Handling

The CLI provides comprehensive error handling and troubleshooting:

### Authentication Errors
```
🔑 Authentication Error
💡 Solutions:
   • Run "cli auth login" to authenticate
   • Use --user <email> to specify a user
   • Use --skipUserValidation for admin operations
```

### Access Denied
```
🚫 Access Denied  
💡 Solutions:
   • Verify you are a member of this league
   • Use --skipUserValidation for admin operations
   • Check the league ID is correct
```

### Configuration Errors
```
🔧 Configuration Error
💡 Solutions:
   • Set SQS_AUTOMATIC_DRAFTS_URL environment variable
   • Run npm run sync-env to update environment
   • Check AWS infrastructure is deployed
```

## Development vs Production

### Development Mode
- **Local Development**: SQS messages may be skipped to avoid AWS costs
- **Status Behavior**: Draft status may remain `queued` indefinitely
- **Testing**: Use `--dryRun` to test configuration without side effects

### Production Mode  
- **Full Processing**: SQS messages are sent and processed by AWS Lambda
- **Status Progression**: Complete flow from `queued` → `in-progress` → `completed`
- **Monitoring**: Full observability through CloudWatch and SQS metrics

## Package.json Scripts

The following scripts have been added to `package.json`:

```json
{
  "cli:start-draft": "nx start-draft cli",
  "draft:start": "nx start-draft cli", 
  "draft:inspect": "nx inspect-sqs-queue cli"
}
```

## Troubleshooting

### Common Issues

**Circular Dependency Error:**
- This is expected during build due to shared dependencies
- Runtime functionality is unaffected
- Use `npx tsx` instead of `nx build` for CLI operations

**Queue Not Configured:**
```bash
# Check environment variables
npm run sync-env

# Verify SQS queue URL is set
echo $SQS_AUTOMATIC_DRAFTS_URL
```

**Database Connection:**
```bash
# Test database connectivity
npm run cli:test-connection
```

**League Access:**
```bash
# Use dry run to test without making changes
npm run draft:start -- --leagueId 1 --dryRun

# Check league exists and user has access
npx tsx --tsconfig tsconfig.base.json apps/cli/src/main.ts graphql-test --query "query { league(id: 1) { id name draftStatus } }"
```

### Debug Mode
```bash
# Enable verbose logging
DEBUG=* npm run draft:start -- --leagueId 1

# Use dry run for safe testing
npm run draft:start -- --leagueId 1 --dryRun
```

## Integration Examples

### With GraphQL
The same logic is available through GraphQL mutations:

```graphql
mutation StartDraft {
  startDraft(leagueId: 1, draftType: "random-draft") {
    id
    name  
    draftStatus
  }
}
```

### With Test Scripts
Test scripts can now use the shared service:

```typescript
import { DraftService } from '@legacy-sports/utils';

const draftService = new DraftService();
const result = await draftService.startDraft({
  leagueId: 1,
  draftType: 'random-draft',
  requestedBy: 1,
  validateUserAccess: false, // For testing
});
```

## Future Enhancements

Potential additions to the draft management system:

- **Draft Scheduling** - Schedule drafts for future execution
- **Draft Templates** - Save and reuse draft configurations  
- **Draft Monitoring** - Real-time draft progress tracking
- **Draft Rollback** - Ability to cancel and rollback drafts
- **Bulk Operations** - Start drafts for multiple leagues