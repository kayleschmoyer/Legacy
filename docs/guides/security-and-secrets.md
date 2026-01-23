# 🔒 Security & Secret Management Guide

## Overview

This guide ensures no sensitive information is accidentally committed to git and provides secure credential management for the Legacy Sports application.

> **🔒 Security Update (LS-55):** All production secrets have been removed from the `.env` file and replaced with safe placeholders. The `.env` file now serves as a template with security warnings. Real credentials should only exist in `.env.local` (gitignored) or AWS Secrets Manager.

## 🚨 CRITICAL: What NOT to Commit

### ❌ Never Commit These to Git:

- **Real JWT signing keys** (`JWT_SECRET=BjyuX301kYZ...` - base64 strings longer than 20 chars)
- **Real cookie secrets** (`COOKIE_SECRET=ZiqhZN/p8p4...` - base64 strings)
- **Real Google OAuth client secrets** (`GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...`)
- **Nx Cloud access tokens** (`NX_CLOUD_ACCESS_TOKEN=NWJhZDNmYTY...`)
- **AWS account IDs** (12-digit numbers like `176661590736`) in URLs or configuration
- **Production database endpoints** (`legacy-sports-dev-postgres.*.rds.amazonaws.com`)
- **Production RDS Proxy endpoints** (`*.proxy-*.rds.amazonaws.com`)
- **Real SQS queue URLs** with AWS account IDs (`sqs.us-east-1.amazonaws.com/176661590736/...`)
- **Real API Gateway URLs** (`https://bd1opa1yv7.execute-api...`)
- **Real database passwords** (not placeholders)

### ✅ Safe to Commit:

- **Placeholder values** (`your-jwt-secret-here`, `DO-NOT-COMMIT-REAL-VALUE`, `YOUR-AWS-ACCOUNT-ID`)
- **Template configurations** (`.env.example` files with placeholders only)
- **Local development defaults** (`localhost`, `your-google-client-id.apps.googleusercontent.com`)
- **AWS secret names/ARNs** (without the actual secret values)
- **Security warning comments** (lines with `# SECURITY:` warnings)

## 🛠️ Security Tools

### Automated Validation

```bash
# Check if files are safe to commit
pnpm run security:validate

# Install git pre-commit hooks (runs automatically)
pnpm run security:install-hooks
```

### Manual Validation

The validation script checks for dangerous patterns:

- Real JWT/Cookie secrets (not placeholders)
- AWS Account IDs in URLs or configurations
- Production database endpoints (\*.amazonaws.com)
- Google OAuth client secrets (real values)

## 📁 File Security Guidelines

### `.env` (Production Template - Tracked by Git)

**⚠️ IMPORTANT: The `.env` file should ONLY contain safe placeholders!**

```bash
# ✅ SAFE - Only placeholders and template variables with security warnings
USE_LOCAL_CREDENTIALS=false
# SECURITY: Production DB credentials are managed by AWS Secrets Manager
DB_SECRET_NAME=your-db-secret-name
DB_HOST=your-db-host.rds.amazonaws.com
JWT_SECRET=your-jwt-secret-here-DO-NOT-COMMIT-REAL-VALUE
COOKIE_SECRET=your-cookie-secret-here-DO-NOT-COMMIT-REAL-VALUE
GOOGLE_OAUTH_CLIENT_SECRET=your-google-oauth-secret-here-DO-NOT-COMMIT-REAL-VALUE
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### `.env.local` (Development - Gitignored)

```bash
# ✅ SAFE - Local development only, not tracked by git
USE_LOCAL_CREDENTIALS=true
DB_HOST=localhost:5432
DB_PASSWORD=your-actual-local-password
```

### `.env.example` (Template - Tracked by Git)

```bash
# ✅ SAFE - Only safe placeholders and examples
USE_LOCAL_CREDENTIALS=true
DB_PASSWORD=your-local-password-here
VITE_GOOGLE_CLIENT_ID=placeholder-google-client-id
```

## 🔄 Credential Resolution Hierarchy

### Development Mode

1. **Local Environment** (`.env.local`) - Real local credentials
2. **Fallback Defaults** - Safe development defaults

### Production Mode

1. **AWS Secrets Manager** - Real production credentials (secure)
2. **Environment Variables** - Set by Lambda/Terraform (safe)
3. **Fallback Defaults** - Safe production defaults

## 🚀 Quick Setup for New Developers

### 1. Initial Setup

```bash
# Copy template to your local environment
cp .env.example .env.local

# Install security hooks
pnpm run security:install-hooks
```

### 2. Configure Local Development

Edit `.env.local` with your actual local development credentials:

```bash
# Set your local database password
DB_PASSWORD=your-actual-local-password

# Set your Google OAuth client ID (if testing OAuth)
VITE_GOOGLE_CLIENT_ID=your-real-google-client-id
```

### 3. Validate Before Commit

```bash
# Always run before committing
pnpm run security:validate

# Should show: ✅ All files are secure for commit!
```

## 🔧 Production Deployment

### AWS Lambda Environment Variables (Set by Terraform)

```bash
# These are set automatically by Terraform/AWS
DB_SECRET_NAME=legacy-sports-db-creds-xyz  # Points to Secrets Manager
JWT_SECRET=legacy-sports-jwt-secret        # Points to Secrets Manager
AWS_REGION=us-east-1
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/${aws_account_id}/queue-name
```

### AWS Secrets Manager Values (Secure Storage)

- `legacy-sports-db-creds-xyz` → `{"username": "postgres", "password": "..."}`
- `legacy-sports-jwt-secret` → `"actual-jwt-signing-key"`
- `legacy-sports-cookie-secret` → `"actual-cookie-secret"`

## 🚨 Incident Response

### If Secrets Are Accidentally Committed:

1. **Immediately revoke/rotate** the exposed credentials:
   - Regenerate JWT signing keys
   - Rotate database passwords
   - Regenerate Google OAuth client secrets
   - Update AWS Secrets Manager with new values

2. **Remove from git history**:

   ```bash
   # Force remove sensitive files from git history
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch .env" \
     --prune-empty --tag-name-filter cat -- --all

   # Force push to rewrite remote history
   git push origin --force --all
   ```

3. **Update infrastructure**:
   - Deploy new secrets to AWS Secrets Manager
   - Update Lambda environment variables
   - Restart applications to pick up new credentials

4. **Verify cleanup**:
   ```bash
   pnpm run security:validate
   ```

## ✅ Security Checklist

Before every commit:

- [ ] Run `pnpm run security:validate`
- [ ] Verify no real passwords in tracked files
- [ ] Confirm `.env.local` has your local credentials
- [ ] Check that `.env` only has placeholders
- [ ] Ensure AWS account IDs are not exposed
- [ ] Validate Google OAuth settings use placeholders

## 🔗 Related Documentation

- [Database Credential Management](./DB_CREDENTIAL_SYSTEM_COMPLETE.md)
- [Environment Setup Guide](./.env.example)
- [AWS Infrastructure Documentation](./AWS_INFRASTRUCTURE_DOCUMENTATION.md)

---

**Remember**: When in doubt, run `pnpm run security:validate` before committing!
