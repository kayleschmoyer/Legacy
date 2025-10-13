# Database Credential Management Migration Guide

## Overview

This migration simplifies database credential management by implementing a unified, hierarchical resolution system that follows AWS security best practices.

## New System Architecture

```
Production:  AWS Secrets Manager → Environment Variables → Defaults
Development: Environment Variables → Defaults
```

## Migration Changes

### ✅ New Environment Variables

```bash
# Primary credential control
USE_LOCAL_CREDENTIALS=true|false        # Choose credential source
DB_SECRET_NAME=secret-name              # AWS Secrets Manager secret name

# Local development (when USE_LOCAL_CREDENTIALS=true)
DB_HOST=localhost:5432                  # Host and port combined
DB_USER=postgres                        # Database user
DB_PASSWORD=your-password               # Database password
DB_NAME=legacy_sports_dev              # Database name

# SSL Configuration (optional)
DB_CERT_PATH=certs/us-east-1-bundle.pem # SSL certificate path
```

### 🔄 Legacy Variables (Still Supported)

```bash
DB_CREDS_PATH=secret-name              # Legacy alias for DB_SECRET_NAME
```

### ❌ Removed Variables

```bash
DB_HOST_DIRECT=...                     # No longer needed
USE_LOCAL_CREDS=...                    # Renamed to USE_LOCAL_CREDENTIALS
```

## Quick Start

### Local Development Setup

1. **Copy environment template:**

   ```bash
   cp .env.example .env.local
   ```

2. **Configure local database:**

   ```bash
   # .env.local
   USE_LOCAL_CREDENTIALS=true
   DB_HOST=localhost:5432
   DB_USER=postgres
   DB_PASSWORD=your-local-password
   DB_NAME=legacy_sports_dev
   ```

3. **Test connection:**
   ```bash
   npm run db:test
   ```

### Production/AWS Database Setup

1. **Configure AWS credentials:**

   ```bash
   # .env.local (for testing production DB locally)
   USE_LOCAL_CREDENTIALS=false
   DB_SECRET_NAME=dev/legacy-sports-db-creds-xyz
   DB_CERT_PATH=certs/us-east-1-bundle.pem
   ```

2. **Test production connection:**
   ```bash
   npm run db:test:production
   ```

## New CLI Commands

### Database Connection Testing

```bash
npm run db:test                    # Test local database
npm run db:test:production         # Test production database
```

### Connection Information

```bash
npm run db:url                     # Get connection URL (local)
npm run db:url:production          # Get connection URL (production)
npm run db:credentials             # Show resolved credentials
```

### PostgreSQL Client Setup

```bash
npm run db:psql                    # Generate psql commands (local)
npm run db:psql:production         # Generate psql commands (production)
```

## Code Migration

### Before (Complex)

```typescript
// Multiple ways to get credentials
const dbHost = getEnvVarRequired('DB_HOST');
const dbCredsPath = getEnvVarOptional('DB_CREDS_PATH');

if (dbCredsPath) {
  // AWS Secrets Manager logic
  const secretString = await retrieveSecretParameterValue(dbCredsPath);
  const credentials = JSON.parse(secretString);
  // ... more complex logic
} else {
  // Environment variable logic
  const dbUser = getEnvVarRequired('DB_USER');
  const dbPassword = getEnvVarRequired('DB_PASSWORD');
  // ... more complex logic
}
```

### After (Simple)

```typescript
// Unified credential resolution
import { resolveDatabaseCredentials } from '@legacy-sports/db-client';

const credentials = await resolveDatabaseCredentials();
// Done! Credentials are automatically resolved based on environment
```

## Security Improvements

### Production (AWS)

- ✅ **Secrets Manager:** All sensitive credentials stored securely
- ✅ **IAM Policies:** Fine-grained access control
- ✅ **SSL/TLS:** Encrypted connections required
- ✅ **No Plain Text:** No credentials in environment variables

### Development

- ✅ **Local Only:** Credentials stay in `.env.local` (gitignored)
- ✅ **Templates:** Safe `.env.example` files with placeholders
- ✅ **Testing:** Easy connection validation

## Terraform Integration

The system automatically works with existing Terraform outputs:

```hcl
# terraform/outputs.tf provides:
output "db_secret_name" {
  value = aws_secretsmanager_secret.database_credentials.name
}

# Lambda environment variables automatically set:
DB_SECRET_NAME = aws_secretsmanager_secret.database_credentials.name
```

## Troubleshooting

### Connection Issues

1. **Test credentials:**

   ```bash
   npm run db:test
   npm run db:credentials
   ```

2. **Check SSL configuration:**

   ```bash
   # Make sure SSL certificate exists
   ls -la certs/us-east-1-bundle.pem
   ```

3. **AWS access issues:**

   ```bash
   # Verify AWS credentials
   aws sts get-caller-identity

   # Test secret access
   aws secretsmanager get-secret-value --secret-id your-secret-name
   ```

### Environment Variable Issues

1. **Check variable precedence:**

   ```bash
   npm run db:credentials  # Shows resolved values
   ```

2. **Variable naming:**
   - Use `USE_LOCAL_CREDENTIALS` (not `USE_LOCAL_CREDS`)
   - Use `DB_SECRET_NAME` (preferred over legacy `DB_CREDS_PATH`)

## Backward Compatibility

- ✅ **Legacy variables** still work (`DB_CREDS_PATH`, etc.)
- ✅ **Existing lambda functions** work without changes
- ✅ **Gradual migration** - update environment files when convenient

## Benefits

1. **Simplified Setup:** Single source of truth for credential configuration
2. **Security:** Proper separation of dev/prod credentials
3. **Developer Experience:** Clear commands and error messages
4. **AWS Best Practices:** Native Secrets Manager integration
5. **Testing:** Easy connection validation and troubleshooting
