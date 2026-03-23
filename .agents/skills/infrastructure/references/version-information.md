# Version Information

> **When to apply:** Debugging production issues, verifying deployments, adding version info to new services, health check monitoring, or release tracking.

## Quick Reference

### Check Version from CLI

```bash
# GraphQL Lambda
curl https://api.legacy-fantasy.com/version

# OAuth Proxy
curl https://api.legacy-fantasy.com/oauth/version

# Game Selection
curl https://api.legacy-fantasy.com/games/version

# Web App - visit /about page in browser
```

### Add Version to New API Gateway Lambda

```typescript
// 1. Import version utilities
import { getVersionInfo, formatVersionInfo } from '@legacy-sports/utils';

// 2. Add version endpoint in main handler (before try/catch)
if (event.path === '/version' || event.path === '/health') {
  const versionInfo = getVersionInfo('your-service-name');
  LOGGER.debug('Version endpoint called', versionInfo);

  return addCorsHeaders({
    statusCode: 200,
    body: JSON.stringify({
      status: 'healthy',
      ...versionInfo,
      timestamp: new Date().toISOString(),
      formatted: formatVersionInfo(versionInfo),
    }),
  });
}
```

### Add Version to SQS Lambda

```typescript
// 1. Import version utilities
import { getVersionInfo, formatVersionInfo } from '@legacy-sports/utils';

// 2. Log version on cold start (module level)
const versionInfo = getVersionInfo('your-service-name');
LOGGER.info('Lambda initialized', {
  version: formatVersionInfo(versionInfo),
  ...versionInfo,
});
```

### Use in React Component

```typescript
import { env } from '../config/environment';

function MyComponent() {
  const { appVersion, commitSha, buildDate, branch } = env;

  return (
    <div>
      <p>Version: {appVersion}</p>
      <p>Commit: {commitSha.substring(0, 7)}</p>
      <p>Branch: {branch}</p>
    </div>
  );
}
```

## Implementation Details

### Version Information Structure

```typescript
interface VersionInfo {
  commitSha: string; // Git commit hash
  buildTimestamp: string; // ISO 8601 timestamp
  version: string; // Semantic version
  branch: string; // Git branch name
  environment: string; // dev/staging/prod
  serviceName: string; // Service identifier
}
```

### How It Works

1. **Build Time**: GitHub Actions injects env vars during build
   - `COMMIT_SHA` / `VITE_COMMIT_SHA`: from `$GITHUB_SHA`
   - `BUILD_TIMESTAMP` / `VITE_BUILD_TIMESTAMP`: from `date -u`
   - `BRANCH` / `VITE_BRANCH`: from `$GITHUB_REF_NAME`
   - `VERSION` / `VITE_VERSION`: from SSM or run number

2. **Runtime**: Version utility reads from environment
   - Node.js: `process.env.*`
   - Browser: `import.meta.env.*` (inlined by Vite)

3. **API Endpoints**: Return JSON with version info
   - `/version` and `/health` routes added to API Gateway lambdas
   - Returns structured JSON with all version details

4. **Logging**: SQS lambdas log version on cold start
   - Version info in CloudWatch Logs
   - Searchable by commit SHA or version

## Environment Variables

### Set During Build (GitHub Actions)

Lambdas:

```yaml
COMMIT_SHA: ${{ github.sha }}
BUILD_TIMESTAMP: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
BRANCH: ${{ github.ref_name }}
```

Web App:

```yaml
VITE_VERSION: ${{ github.ref_name }}-${{ github.run_number }}
VITE_COMMIT_SHA: ${{ github.sha }}
VITE_BUILD_TIMESTAMP: ${{ github.event.repository.updated_at }}
VITE_BRANCH: ${{ github.ref_name }}
```

### Modified Files

When adding version to new service, update:

- `.github/actions/build-lambda/action.yml` (if new lambda)
- `.github/workflows/deploy-*.yml` (add env vars)
- Lambda `src/index.ts` (add version endpoint or logging)

## Testing

### Local Development

Version info shows "unknown" locally (expected):

```typescript
{
  commitSha: "unknown",
  buildTimestamp: "unknown",
  version: "0.0.0",
  branch: "unknown",
  environment: "development"
}
```

### After Deployment

1. Check version endpoint:

   ```bash
   curl https://your-api-url/version
   ```

2. Verify commit SHA matches:

   ```bash
   echo $GITHUB_SHA
   # Should match commitSha in response
   ```

3. Check CloudWatch for SQS lambdas:
   ```bash
   aws logs tail /aws/lambda/your-lambda-name --follow
   # Look for "Lambda initialized" with version
   ```

## Common Issues

### "unknown" in Production

**Cause**: Environment variables not set during build

**Fix**: Check workflow file has env vars in build step:

```yaml
- name: Build
  env:
    VITE_COMMIT_SHA: ${{ github.sha }}
    # ... other vars
```

### Import Error for Version Utility

**Cause**: Utils library not built

**Fix**:

```bash
pnpm exec nx build utils
```

### Old Version After Deploy

**Cause**: Lambda or web app not actually updated

**Fix**:

- Lambda: Check Terraform apply logs
- Web: Clear cache or check deployment logs

## Files

- Version utility: `lib/utils/src/lib/version.ts`
- Build action: `.github/actions/build-lambda/action.yml`
- Web workflow: `.github/workflows/deploy-web.yml`
- Documentation: `docs/deployment/version-information.md`
- Web config: `apps/web/src/config/environment.ts`
- About page: `apps/web/src/components/AboutPage.tsx`
