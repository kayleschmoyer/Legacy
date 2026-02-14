# Version and Deployment Information

This document describes how to access version and deployment information for all Legacy Sports services.

## Overview

All deployed services (lambdas and web application) now expose version and deployment information, including:

- **Commit SHA**: Git commit hash that was deployed
- **Build Timestamp**: When the build was created
- **Version**: Semantic version or build number
- **Branch**: Git branch that was deployed
- **Environment**: Deployment environment (dev, staging, prod)

## Accessing Version Information

### Web Application

Visit the **About** page in the web application:

```
https://legacy-fantasy.com/about
```

The About page displays:

- Application version
- Commit SHA (clickable link to GitHub)
- Build date/time
- Git branch
- Environment details
- GraphQL API endpoint

### Lambda Endpoints

All API Gateway-backed lambdas expose version endpoints:

#### GraphQL Lambda (GQL)

```bash
# Version endpoint
curl https://your-api-gateway-url/version

# Health check endpoint
curl https://your-api-gateway-url/health
```

**Example Response:**

```json
{
  "status": "healthy",
  "commitSha": "a1b2c3d4e5f6...",
  "buildTimestamp": "2026-02-13T10:30:00Z",
  "version": "1.2.3",
  "branch": "main",
  "environment": "dev",
  "serviceName": "legacy-sports-gql",
  "timestamp": "2026-02-13T11:45:23.456Z",
  "formatted": "legacy-sports-gql v1.2.3 (a1b2c3d) built 2026-02-13T10:30:00Z on main"
}
```

#### OAuth Proxy Lambda

```bash
# Version endpoint
curl https://your-api-gateway-url/oauth/version

# Health check endpoint
curl https://your-api-gateway-url/oauth/health
```

Returns the same JSON structure as above with `serviceName: "legacy-sports-oauth-proxy"`.

#### Game Selection Lambda

```bash
# Version endpoint
curl https://your-api-gateway-url/games/version

# Health check endpoint
curl https://your-api-gateway-url/games/health
```

Returns the same JSON structure as above with `serviceName: "legacy-sports-game-selection"`.

### SQS-Triggered Lambdas

For lambdas triggered by SQS (Stats Lambda, Draft Processor, WebSocket), version information is logged on cold start:

- **Stats Lambda**: Check CloudWatch Logs for "Stats Lambda initialized" with version details
- **Draft Processor**: Check CloudWatch Logs for "Draft Processor Lambda initialized"
- **WebSocket**: Check CloudWatch Logs for "WebSocket Lambda initialized"

**Example CloudWatch Log Entry:**

```json
{
  "message": "Stats Lambda initialized",
  "version": "legacy-sports-stats-lambda v1.2.3 (a1b2c3d) built 2026-02-13T10:30:00Z on main",
  "commitSha": "a1b2c3d4e5f6...",
  "buildTimestamp": "2026-02-13T10:30:00Z",
  "branch": "main",
  "environment": "dev",
  "serviceName": "legacy-sports-stats-lambda"
}
```

## How It Works

### Build-Time Injection

Version information is injected at build time via environment variables:

**For Lambdas:**

- Set in `.github/actions/build-lambda/action.yml`
- Environment variables: `COMMIT_SHA`, `BUILD_TIMESTAMP`, `BRANCH`
- Also available as `VITE_*` variants for consistency

**For Web App:**

- Set in `.github/workflows/deploy-web.yml`
- Environment variables: `VITE_VERSION`, `VITE_COMMIT_SHA`, `VITE_BUILD_TIMESTAMP`, `VITE_BRANCH`
- Vite automatically inlines these at build time

### Shared Version Utility

All services use a shared utility from `@legacy-sports/utils`:

```typescript
import { getVersionInfo, formatVersionInfo } from '@legacy-sports/utils';

const versionInfo = getVersionInfo('my-service-name');
console.log(formatVersionInfo(versionInfo));
// Output: "my-service-name v1.2.3 (a1b2c3d) built 2026-02-13T10:30:00Z on main"
```

**API:**

```typescript
interface VersionInfo {
  commitSha: string; // Git commit SHA (short or full)
  buildTimestamp: string; // ISO 8601 timestamp
  version: string; // Semantic version
  branch: string; // Git branch name
  environment: string; // Deployment environment
  serviceName: string; // Service identifier
}

// Get version information (works in Node.js and browser)
function getVersionInfo(serviceName: string): VersionInfo;

// Format as readable string
function formatVersionInfo(info: VersionInfo): string;

// Get short version identifier (for logging)
function getShortVersion(info: VersionInfo): string;
```

## Use Cases

### 1. Debugging Production Issues

When a user reports an issue, check the version information:

1. Ask user to visit `/about` page and share the commit SHA
2. Or check CloudWatch Logs for lambda invocation version
3. Look up the commit on GitHub to see what code was deployed
4. Compare with recent deployments to identify regression

### 2. Verifying Deployments

After deploying a change:

1. Check the `/version` or `/health` endpoint
2. Verify the commit SHA matches your deployment
3. Confirm the build timestamp is recent
4. Check the environment matches expectations

### 3. Monitoring and Alerting

Use version endpoints for health checks:

```bash
# Check if service is healthy and get version
curl -f https://api.example.com/version || alert "Service down"
```

### 4. Release Tracking

Use version information in logging and monitoring tools:

- Tag errors in Sentry with commit SHA
- Track deployments in monitoring dashboards
- Correlate issues with specific releases

## Environment Variables Reference

### Lambda Build Variables

Set automatically by GitHub Actions during build:

```bash
VITE_COMMIT_SHA="${GITHUB_SHA}"              # Full 40-char commit hash
VITE_BUILD_TIMESTAMP="2026-02-13T10:30:00Z"  # ISO 8601 timestamp
VITE_BRANCH="${GITHUB_REF_NAME}"             # Branch name (e.g., "main")
VERSION="1.2.3"                              # From SSM Parameter Store

# Also available without VITE_ prefix for Node.js compatibility
COMMIT_SHA="${GITHUB_SHA}"
BUILD_TIMESTAMP="2026-02-13T10:30:00Z"
BRANCH="${GITHUB_REF_NAME}"
```

### Web App Build Variables

Set in `.github/workflows/deploy-web.yml`:

```bash
VITE_VERSION="main-123"                      # Branch + run number
VITE_APP_VERSION="main-123"                  # Alias for VITE_VERSION
VITE_COMMIT_SHA="${GITHUB_SHA}"              # Full commit hash
VITE_BUILD_TIMESTAMP="${GITHUB_EVENT_TIME}"  # Repository updated time
VITE_BRANCH="${GITHUB_REF_NAME}"             # Branch name
```

### Runtime Environment Detection

The version utility automatically detects the environment:

```typescript
// From AWS Lambda environment
environment: process.env.AWS_STAGE || 'development';

// From Vite/Node.js environment
environment: process.env.VITE_ENV || process.env.NODE_ENV || 'development';
```

## Example Usage Scenarios

### Scenario 1: Checking Production GraphQL Version

```bash
# Option 1: Using curl
curl https://api.legacy-fantasy.com/version | jq

# Option 2: Using httpie
http https://api.legacy-fantasy.com/version

# Option 3: In browser
# Just visit: https://api.legacy-fantasy.com/version
```

### Scenario 2: Logging Version on Lambda Cold Start

```typescript
import { getVersionInfo, formatVersionInfo } from '@legacy-sports/utils';
import { LOGGER } from '@legacy-sports/logging';

// At module level (runs on cold start)
const versionInfo = getVersionInfo('my-lambda-name');
LOGGER.info('Lambda initialized', {
  version: formatVersionInfo(versionInfo),
  ...versionInfo,
});
```

### Scenario 3: Displaying Version in UI

```typescript
import { getVersionInfo } from '@legacy-sports/utils';

function VersionDisplay() {
  const version = getVersionInfo('web-app');

  return (
    <div>
      <p>Version: {version.version}</p>
      <p>Commit: {version.commitSha.substring(0, 7)}</p>
      <p>Built: {new Date(version.buildTimestamp).toLocaleString()}</p>
    </div>
  );
}
```

### Scenario 4: Health Check Script

```bash
#!/bin/bash
# check-services.sh - Verify all services are healthy and get versions

SERVICES=(
  "https://api.legacy-fantasy.com/version"
  "https://api.legacy-fantasy.com/oauth/version"
  "https://api.legacy-fantasy.com/games/version"
)

echo "Checking service versions..."
for service in "${SERVICES[@]}"; do
  echo ""
  echo "Checking: $service"
  response=$(curl -s -w "\n%{http_code}" "$service")
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "200" ]; then
    echo "✓ Status: Healthy"
    echo "$body" | jq -r '"  Version: \(.version)\n  Commit: \(.commitSha[0:7])\n  Branch: \(.branch)\n  Built: \(.buildTimestamp)"'
  else
    echo "✗ Status: Unhealthy (HTTP $http_code)"
  fi
done
```

## Troubleshooting

### Version Shows "unknown"

If version information shows "unknown" values:

1. **Check build logs**: Verify environment variables were set during build
2. **Local development**: Version info is only injected in CI/CD builds
3. **Environment variables**: Ensure GitHub Actions secrets are configured

### Old Version After Deployment

If the version endpoint shows an old version:

1. **Lambda**: Check if Lambda function was updated (Terraform apply may have skipped)
2. **Web**: Clear CloudFront cache or wait for TTL
3. **SQS Lambdas**: Trigger a new invocation to force cold start

### Version Utility Import Errors

If you get import errors for the version utility:

```bash
# Rebuild the utils library
pnpm exec nx build utils

# Check that it exports the version module
cat lib/utils/src/index.ts | grep version
```

## Related Documentation

- [Deployment Guide](./deployment/README.md)
- [Lambda Build Process](./build-and-tooling/lambda-builds.md)
- [Web Deployment](./deployment/web-deployment.md)
- [Monitoring and Logging](./architecture/monitoring.md)

## Changelog

- **2026-02-13**: Initial implementation (LS-112)
  - Added version utility to `@legacy-sports/utils`
  - Implemented version endpoints for all API Gateway lambdas
  - Added version logging for SQS-triggered lambdas
  - Enhanced About page with branch information
  - Updated build workflows to inject version info
