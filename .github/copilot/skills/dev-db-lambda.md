# Skill: Running Dev DB Lambda

## Overview

Start the local GraphQL database Lambda for development, providing a local backend for testing without deploying to AWS.

## When to Use

- During active development on GraphQL features
- Testing database queries locally
- Debugging Lambda functionality
- Working offline or without AWS access
- Integration testing with local web server

## Command

```powershell
# Start the DB Lambda locally
pnpm exec nx run db:serve
```

## Alternative Commands

### Using SAM CLI (if configured)

```powershell
sam local start-api --template lambdas/db/template.yaml
```

### Using Lambda invoke locally

```powershell
pnpm exec nx run db:serve --watch
```

### Build and run

```powershell
# Build first
pnpm exec nx run db:build

# Then serve
pnpm exec nx run db:serve
```

## Expected Output

- **Success**: Lambda server starts (typically on port 3001 or configured port)
- **Console**: Lambda initialization and request logs
- **Errors**: Database connection errors or GraphQL schema errors

## Default Configuration

- **Port**: Check `lambdas/db/project.json` for configuration
- **GraphQL Endpoint**: `http://localhost:<port>/graphql`
- **Database**: Connects to configured database (local or dev)

## Common Issues

### Issue: Database connection failed

**Solution**:

- Verify database credentials in environment variables
- Check if database is running
- Sync environment variables: `.\scripts\sync-env.ps1`

### Issue: Port already in use

**Solution**:

- Stop other Lambda processes
- Check for zombie node processes
- Configure different port in project.json

### Issue: GraphQL schema errors

**Solution**:

- Fix schema definitions in `lambdas/db/src/schema/`
- Rebuild: `pnpm exec nx run db:build`
- Regenerate client types: `pnpm exec nx run web:codegen`

### Issue: Module not found

**Solution**:

```powershell
# Install dependencies
pnpm install

# Rebuild Lambda layers if needed
pnpm exec nx run db:build
```

### Issue: Environment variables not loaded

**Solution**:

```powershell
# Sync from AWS
.\scripts\sync-env.ps1

# Or manually create .env file with required variables
```

### Issue: Lambda timeout errors

**Solution**: Increase timeout in `lambdas/db/project.json` serve configuration

## Best Practices

1. **Dedicated terminal**: Run in separate terminal from web server
2. **Environment sync**: Always sync environment variables first
3. **Database state**: Use test database for local development
4. **Watch mode**: Enable watch mode for auto-reload on changes
5. **Logging**: Monitor logs for database queries and errors

## Development Workflow

### Starting Local Development

```powershell
# 1. Sync environment variables
.\scripts\sync-env.ps1

# 2. Build the Lambda (first time or after major changes)
pnpm exec nx run db:build

# 3. Start the Lambda server
pnpm exec nx run db:serve

# Lambda runs at http://localhost:<port>/graphql
```

### Full Stack Local Development

```powershell
# Terminal 1: Start DB Lambda
pnpm exec nx run db:serve

# Terminal 2: Start Web Server
npm start

# Both services now running locally
```

## GraphQL Playground

### Access GraphQL Playground

If enabled, navigate to:

```
http://localhost:<port>/graphql
```

### Test Queries

Use the playground to:

- Test GraphQL queries and mutations
- Inspect schema documentation
- Debug resolver issues
- Validate authentication

## Database Connection

### Local Database

Configure environment variables for local PostgreSQL:

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/legacy_sports_dev
```

### AWS Dev Database

Use RDS proxy endpoint from environment sync:

```bash
DATABASE_URL=<synced-from-aws>
```

### Connection Pooling

The Lambda uses Drizzle ORM with connection pooling configured.

## Watch Mode

### Enable Auto-reload

```powershell
pnpm exec nx run db:serve --watch
```

Changes to Lambda code automatically trigger rebuild and restart.

## Performance Notes

- **Startup**: 5-10 seconds for cold start
- **Hot reload**: 2-4 seconds with watch mode
- **Query latency**: Faster than AWS Lambda (no cold starts)
- **Memory**: Typically 100-300MB

## Debugging

### Enable Debug Logging

```powershell
$env:DEBUG = "true"
$env:LOG_LEVEL = "debug"
pnpm exec nx run db:serve
```

### Inspect Database Queries

- Enable query logging in Drizzle configuration
- Monitor database logs
- Use GraphQL Playground to test queries

### Check Lambda Logs

Watch console output for:

- GraphQL operation logs
- Database query logs
- Error stack traces
- Performance metrics

## Testing with Lambda

### Manual Testing

1. Start Lambda server
2. Use GraphQL Playground or Postman
3. Send test queries/mutations
4. Verify responses

### Automated Testing

```powershell
# Run Lambda integration tests
pnpm exec nx run db:test

# Run with local Lambda server
pnpm exec nx run db:test:integration
```

## Stopping the Server

### Clean Stop

```powershell
# Press Ctrl+C in the terminal
```

### Force Stop

```powershell
# Find and kill the process
Get-Process -Name node | Where-Object {$_.CommandLine -like "*db:serve*"} | Stop-Process
```

## Configuration Files

- `lambdas/db/project.json` - Nx project configuration
- `lambdas/db/src/schema/` - GraphQL schema definitions
- `lambdas/db/src/resolvers/` - GraphQL resolvers
- `.env.local` - Local environment variables

## Common Development Tasks

### Update GraphQL Schema

```powershell
# 1. Modify schema files in lambdas/db/src/schema/

# 2. Rebuild db Lambda
pnpm exec nx run db:build

# 3. Regenerate client types (web/mobile)
pnpm exec nx run web:codegen

# 4. Restart Lambda server
# (or rely on watch mode for auto-restart)
```

### Test Database Migration

```powershell
# 1. Create migration
pnpm exec drizzle-kit generate:pg

# 2. Apply migration
pnpm exec drizzle-kit push:pg

# 3. Restart Lambda to use new schema
```

### Add New Resolver

```powershell
# 1. Add resolver in lambdas/db/src/resolvers/

# 2. Update schema if needed

# 3. Rebuild (or watch mode auto-rebuilds)
pnpm exec nx run db:build

# 4. Test with GraphQL Playground
```

## Environment Variables Required

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - For authentication
- `AWS_REGION` - AWS region (for AWS services)
- Additional vars per feature requirements

## Deploying Changes

### Test Locally First

```powershell
# 1. Test locally
pnpm exec nx run db:serve

# 2. Run tests
pnpm exec nx run db:test

# 3. Build for production
pnpm exec nx run db:build
```

### Deploy to AWS

```powershell
# Deploy using deployment script
.\scripts\deploy-lambda.ps1 -FunctionName db

# Then apply infrastructure changes
cd terraform
terraform apply
```

## Exit Codes

- **0**: Clean shutdown
- **1**: Error during startup or runtime

## Related Skills

- [Dev Web Server](dev-web.md) - Web application server
- [Sync Environment](sync-env.md) - Environment variable management
- [Testing](test.md) - Running Lambda tests
- [Building](build.md) - Building Lambda for deployment

## Troubleshooting Checklist

- [ ] Environment variables synced
- [ ] Dependencies installed
- [ ] Database accessible
- [ ] Port available
- [ ] Lambda built successfully
- [ ] GraphQL schema valid
- [ ] No TypeScript errors
- [ ] Database migrations applied
