# OAuth Proxy Lambda

This Lambda function handles OAuth authentication flows for the Legacy Sports application.

## Overview

The OAuth Proxy provides secure authentication through Google OAuth and generates JWT tokens for application access. It supports both mobile (authorization code flow) and web (ID token flow) authentication patterns.

## Endpoints

- `POST /oauth/google` - Google OAuth authentication
- `POST /oauth/google/refresh` - Refresh Google OAuth tokens
- `OPTIONS *` - CORS preflight handling

## Environment Variables

| Variable                          | Description                                        | Required |
| --------------------------------- | -------------------------------------------------- | -------- |
| `CLIENT_ID`                       | Google OAuth client ID                             | Yes      |
| `GOOGLE_OAUTH_CLIENT_SECRET_PATH` | AWS Secrets Manager path for Google client secret  | Yes      |
| `JWT_SECRET_KEY_PATH`             | AWS Secrets Manager path for JWT signing key       | Yes      |
| `COOKIE_SECRET_KEY_PATH`          | AWS Secrets Manager path for cookie encryption key | Yes      |
| `DB_CREDS_PATH`                   | AWS Secrets Manager path for database credentials  | Yes      |
| `DB_HOST`                         | Database host endpoint                             | Yes      |
| `NODE_ENV`                        | Environment (development/production)               | Yes      |
| `LOG_LEVEL`                       | Logging verbosity level                            | No       |

## Logging Configuration

The OAuth Proxy uses structured logging with configurable verbosity levels:

### Log Levels

- **`debug`** - Most verbose, shows all operations and state changes
- **`info`** - Standard operational messages (default)
- **`warn`** - Warning conditions
- **`error`** - Error conditions
- **`fatal`** - Critical failures

### Setting Log Level

Set the `LOG_LEVEL` environment variable to control logging verbosity:

```bash
# In development - see all debug information
LOG_LEVEL=debug

# In production - standard logging (default)
LOG_LEVEL=info

# Only errors and warnings
LOG_LEVEL=warn
```

### Migration from VERBOSE_LOGGING

Previously, verbose logging was controlled by `VERBOSE_LOGGING=true`. This has been replaced with the standard `LOG_LEVEL` system:

**Old approach:**

```bash
VERBOSE_LOGGING=true  # Enabled detailed logging
```

**New approach:**

```bash
LOG_LEVEL=debug  # Same level of detail, but more flexible
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
npm test

# Build for deployment
pnpm run build

# Local development
pnpm run dev
```

## Deployment

The function is deployed via Terraform. The `LOG_LEVEL` is configured in `terraform/lambda-oauth-proxy.tf`:

```hcl
LOG_LEVEL = "debug"  # or "info" for production
```
