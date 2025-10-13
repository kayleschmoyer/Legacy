# GitHub Secrets Configuration for Lambda Deployments

## Overview

Our Lambda deployment workflows use different secrets depending on the functionality they provide. This guide explains how to configure GitHub repository secrets for each Lambda function.

## Required Secrets by Lambda

### 🔐 OAuth Proxy Lambda
**File**: `.github/workflows/deploy-oauth-proxy.yml`  
**Required Secrets**:
- `GOOGLE_OAUTH_CLIENT_SECRET` - Google OAuth client secret for user authentication
- `JWT_SECRET_KEY` - Secret key for JWT token signing (optional - will auto-generate if not provided)

### 📊 Stats Lambda  
**File**: `.github/workflows/deploy-stats.yml`  
**Required Secrets**: None (uses direct AWS Lambda API, no Terraform variables needed)

### 🎮 Game Selection Lambda
**File**: `.github/workflows/deploy-game-selection.yml`  
**Required Secrets**: TBD (depends on external API integrations)

### 📝 Draft Processor Lambda  
**File**: `.github/workflows/deploy-draft-processor.yml`  
**Required Secrets**: TBD (depends on SQS and processing requirements)

### 🗄️ GraphQL Lambda (DB)
**File**: `.github/workflows/deploy-gql.yml`  
**Required Secrets**: 
- `DB_PASSWORD` - Database connection password (if not using IAM auth)
- `GOOGLE_OAUTH_CLIENT_SECRET` - For user context in GraphQL operations

## Setting Up GitHub Secrets

### 1. Navigate to Repository Settings
1. Go to your GitHub repository
2. Click **Settings** tab
3. Click **Secrets and variables** → **Actions**

### 2. Add Required Secrets
Click **New repository secret** and add each required secret:

```
Name: GOOGLE_OAUTH_CLIENT_SECRET
Value: [Your Google OAuth Client Secret from Google Cloud Console]

Name: JWT_SECRET_KEY  
Value: [A strong random string, e.g., generated with: openssl rand -base64 32]

Name: DB_PASSWORD
Value: [Your RDS database password]
```

## How Secrets Are Used in Workflows

### Environment Variable Method (Recommended)
```yaml
- name: "🚀 Deploy Infrastructure"
  working-directory: terraform
  env:
    # Terraform automatically picks up TF_VAR_* environment variables
    TF_VAR_google_oauth_client_secret: ${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}
    TF_VAR_jwt_secret_key: ${{ secrets.JWT_SECRET_KEY }}
  run: |
    terraform plan -target=aws_lambda_function.oauth_proxy -input=false
    terraform apply -target=aws_lambda_function.oauth_proxy -auto-approve -input=false
```

### Variable File Method (Alternative)
```yaml
- name: "🚀 Deploy Infrastructure"  
  working-directory: terraform
  run: |
    # Create temporary variables file
    cat << EOF > secrets.auto.tfvars
    google_oauth_client_secret = "${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}"
    jwt_secret_key = "${{ secrets.JWT_SECRET_KEY }}"
    EOF
    
    terraform plan -var-file=secrets.auto.tfvars -input=false
    terraform apply -var-file=secrets.auto.tfvars -auto-approve -input=false
    
    # Clean up
    rm -f secrets.auto.tfvars
```

## Security Best Practices

### ✅ Do's
- Use GitHub repository secrets for sensitive values
- Use environment variables with `TF_VAR_` prefix for Terraform
- Add `-input=false` to prevent interactive prompts
- Use meaningful secret names that indicate their purpose
- Document which secrets each workflow requires

### ❌ Don'ts  
- Never commit secrets to git (even in comments)
- Don't echo secret values in workflow logs
- Don't store secrets in plain text files committed to repo
- Don't use secrets for non-sensitive configuration values

## Troubleshooting

### "Context access might be invalid" Warning
This lint warning is expected and safe to ignore. GitHub Actions can't validate secret existence at lint time.

### "Error: Required variable not set"
1. Verify the secret exists in GitHub repository settings
2. Check the secret name matches exactly (case-sensitive)
3. Ensure the workflow has proper `env:` section

### Terraform Hangs on Variable Input
- Add `-input=false` to terraform commands
- Verify all required variables are provided via environment or var files
- Check that variable names match Terraform variable definitions

## Testing Secret Configuration

### Verify Secrets Are Available
```yaml
- name: "🔍 Verify Secrets"  
  run: |
    if [ -z "${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}" ]; then
      echo "❌ GOOGLE_OAUTH_CLIENT_SECRET not configured"
      exit 1
    else
      echo "✅ Required secrets are configured"
    fi
```

### Test Terraform Variables
```yaml
- name: "🧪 Test Terraform Variables"
  env:
    TF_VAR_google_oauth_client_secret: ${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}
  run: |
    # This will show if the variable is properly set (without revealing the value)
    terraform console <<< 'var.google_oauth_client_secret != ""'
```

## Lambda-Specific Configuration Examples

### OAuth Proxy Deployment
```yaml
# Requires OAuth secrets for Google authentication
env:
  TF_VAR_google_oauth_client_secret: ${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}
  TF_VAR_jwt_secret_key: ${{ secrets.JWT_SECRET_KEY }}
```

### Stats Lambda Deployment  
```yaml
# No secrets required - uses AWS Lambda API directly
# Skips Terraform to avoid OAuth secret dependencies
```

### GraphQL Lambda Deployment
```yaml
# May require database and OAuth secrets
env:
  TF_VAR_google_oauth_client_secret: ${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}
  TF_VAR_db_password: ${{ secrets.DB_PASSWORD }}
```

## Adding New Secrets

When adding a new Lambda that requires secrets:

1. **Identify Required Variables**: Check `terraform/secrets.tf` and lambda-specific `.tf` files
2. **Add to GitHub Secrets**: Use repository settings to add the secret values  
3. **Update Workflow**: Add appropriate `TF_VAR_*` environment variables
4. **Update This Guide**: Document the new requirements
5. **Test Deployment**: Verify the workflow runs successfully with new secrets

---

**Need Help?** Check the Terraform configuration in `terraform/secrets.tf` to see all available variables and their descriptions.