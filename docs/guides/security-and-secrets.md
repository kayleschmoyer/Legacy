# 🔒 Security & Secret Management Guide

## Overview

This guide ensures no sensitive information is accidentally committed to git and provides secure credential management for the Legacy Sports application.

## 🚨 CRITICAL: What NOT to Commit

### ❌ Never Commit These to Git:

- **Real JWT signing keys** (`JWT_SECRET=long-base64-string`)
- **Real cookie secrets** (`COOKIE_SECRET=long-string`)
- **AWS account IDs** (12-digit numbers like `176661590736`)
- **Production database endpoints** (`*.amazonaws.com`)
- **Google OAuth client secrets** (real values, not placeholders)
- **Real SQS queue URLs** with account IDs
- **Real database passwords**

### ✅ Safe to Commit:

- **Placeholder values** (`your-jwt-secret-here`, `REPLACE_WITH_ACTUAL`)
- **Template configurations** (`.env.example` files)
- **Local development defaults** (`localhost`, `placeholder-client-id`)
- **AWS secret names/ARNs** (without the actual secret values)

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

```bash
# ✅ SAFE - Only placeholders and template variables
USE_LOCAL_CREDENTIALS=false
DB_SECRET_NAME=${DB_SECRET_NAME}  # Terraform substitution
JWT_SECRET=${JWT_SECRET}          # AWS Secrets Manager
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### `.env.local` (Development - Gitignored)

```bash
# ✅ SAFE - Local development only, not tracked by git
USE_LOCAL_CREDENTIALS=true
DB_HOST=localhost:5432
DB_PASSWORD=my-actual-local-password
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
