---
name: dev-web
description: 'Start the Next.js development server for the web application with hot-reloading and local development features.'
---

# Skill: Running Dev Web Server

## Overview

Start the Next.js development server for the web application with hot-reloading and development features.

## When to Use

- During active development on web features
- Testing web UI changes locally
- Debugging web application issues
- Verifying web builds work correctly

## Command

```powershell
npm start
```

## Alternative Commands

### Using pnpm directly

```powershell
pnpm run dev:web
```

### Using Nx directly

```powershell
pnpm exec nx run web:serve
```

### With custom port

```powershell
pnpm exec nx run web:serve --port=3001
```

## Expected Output

- **Success**: Server starts at `http://localhost:3000` (or specified port)
- **Console**: Compilation messages and hot-reload notifications
- **Errors**: Build errors or runtime errors in console

## Default Configuration

- **URL**: `http://localhost:3000`
- **Hot Reload**: Enabled
- **Source Maps**: Enabled in dev mode
- **Fast Refresh**: React Fast Refresh enabled

## Common Issues

### Issue: Port 3000 already in use

**Solution**:

- Stop other processes using port 3000
- Or use alternative port: `pnpm exec nx run web:serve --port=3001`

### Issue: Module not found errors

**Solution**: Run `pnpm install` to ensure dependencies are installed

### Issue: Build fails with type errors

**Solution**: Fix TypeScript errors first with `pnpm exec nx affected -t typecheck`

### Issue: GraphQL types out of sync

**Solution**: Run GraphQL codegen to regenerate types

### Issue: Environment variables not loaded

**Solution**: Ensure `.env.local` exists and is properly configured (see sync-env skill)

### Issue: Stale cache causing issues

**Solution**:

```powershell
# Clear Next.js cache
Remove-Item -Recurse -Force apps/web/.next
# Then restart server
npm start
```

## Best Practices

1. **Already running check**: Don't start if server already running in another terminal
2. **Environment setup**: Sync environment variables first (see sync-env skill)
3. **Database connection**: Ensure DB Lambda or direct DB connection is available
4. **Background process**: Run in dedicated terminal window
5. **Stop cleanly**: Use Ctrl+C to stop, not terminal close

## Development Workflow

### Starting Fresh Development Session

```powershell
# 1. Sync environment variables
.\scripts\sync-env.ps1  # See sync-env.md

# 2. Ensure dependencies installed
pnpm install

# 3. Start web server
npm start

# Server runs at http://localhost:3000
```

### Working with GraphQL

The web app connects to:

- **Local Dev**: GraphQL service (if running)
- **AWS Dev**: Lambda GraphQL endpoint (via environment variables)

Ensure GraphQL endpoint is configured in environment variables.

## Terminal Management

### Keep Server Running

- Run in dedicated terminal window
- Don't close terminal while developing
- Monitor console for errors

### Background vs Foreground

- **Foreground** (recommended): See real-time logs and errors
- **Background**: Use job control if needed (not typical for web dev)

## Hot Reload Behavior

### Automatic Reload

- **Component changes**: Fast Refresh (keeps state)
- **Hook changes**: Fast Refresh with state reset
- **Config changes**: Full reload required
- **Environment changes**: Restart required

### When to Restart

- Environment variable changes
- `next.config.js` modifications
- Package installation
- Persistent errors

## Related Services

### Database Lambda (optional)

If using local DB Lambda:

```powershell
# In separate terminal
.\scripts\start-db-lambda.ps1  # See dev-db-lambda.md
```

### GraphQL Service

May need GraphQL service running locally or use AWS dev environment.

## Performance Notes

- **Initial build**: 10-30 seconds (depending on changes)
- **Hot reload**: 1-3 seconds for most changes
- **Memory**: Typically 200-500MB
- **CPU**: Moderate during compilation

## Debugging

### Enable Verbose Output

```powershell
$env:DEBUG = "*"
npm start
```

### Check Server Status

Open browser to `http://localhost:3000/api/health` (if health endpoint exists)

### View Network Requests

- Use browser DevTools Network tab
- Check console for GraphQL errors
- Monitor API calls to backend

## Stopping the Server

### Clean Stop

```powershell
# Press Ctrl+C in the terminal
# Wait for graceful shutdown
```

### Force Stop

```powershell
# If hung, force kill
Get-Process -Name node | Where-Object {$_.Path -like "*legacy-sports*"} | Stop-Process
```

## Configuration Files

- `apps/web/next.config.js` - Next.js configuration
- `apps/web/project.json` - Nx project configuration
- `.env.local` - Local environment variables (not in git)
- `.env.development` - Development defaults

## Common Development Tasks

### Test Authentication Flow

1. Start web server
2. Navigate to login page
3. Test OAuth flows
4. Check console for auth errors

### Test GraphQL Integration

1. Start web server
2. Open browser console
3. Navigate to pages using GraphQL
4. Check Network tab for GraphQL requests

### Test Responsive Design

1. Start web server
2. Open browser DevTools
3. Toggle device emulation
4. Test different viewports

## Exit Codes

- **0**: Clean shutdown
- **1**: Error during startup or runtime
- **SIGINT** (Ctrl+C): User-initiated shutdown

## Related Skills

- [Dev DB Lambda](dev-db-lambda.md) - Local database Lambda
- [Sync Environment](sync-env.md) - Environment variable management
- [Building](build.md) - Production builds
- [Testing](test.md) - Running tests

## Troubleshooting Checklist

- [ ] Dependencies installed (`pnpm install`)
- [ ] Environment variables synced
- [ ] Port 3000 available
- [ ] No TypeScript errors
- [ ] Database accessible (if needed)
- [ ] GraphQL endpoint configured
- [ ] No stale cache issues
