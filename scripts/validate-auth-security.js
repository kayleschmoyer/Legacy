#!/usr/bin/env node
/**
 * Authentication Security Validation Script
 *
 * This script validates that no authentication credentials or secrets
 * are accidentally committed to the git repository.
 *
 * Run before commits to ensure security compliance.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DANGEROUS_PATTERNS = [
  // Real Google Client IDs in environment files (not fallback values in code)
  /VITE_GOOGLE_CLIENT_ID=\d+-[a-zA-Z0-9]+\.apps\.googleusercontent\.com/,
  // AWS Account IDs in environment files (not GitHub Actions)
  /AWS_ACCOUNT_ID=\d{12}/,
  // AWS Account IDs in URLs (like SQS)
  /amazonaws\.com\/\d{12}\//,
  // Database passwords (not placeholder values)
  /DB_PASSWORD=(?!your-password-here|placeholder)[^\s]+/,
  // JWT secrets (not placeholder values) - base64 strings longer than 20 chars
  /JWT_SECRET=(?!your-jwt-secret|placeholder|your-local-jwt|DO-NOT-COMMIT)[A-Za-z0-9+/]{20,}/,
  // Cookie secrets (not placeholder values) - base64 strings
  /COOKIE_SECRET=(?!your-cookie-secret|placeholder|your-local-cookie|DO-NOT-COMMIT)[A-Za-z0-9+/=]{20,}/,
  // Google OAuth Client Secrets
  /GOOGLE_OAUTH_CLIENT_SECRET=(?!your-google-oauth|placeholder|DO-NOT-COMMIT)GOCSPX-[A-Za-z0-9_-]+/,
  // API keys (not placeholder values)
  /API_KEY=(?!your-api-key|placeholder)[^\s]+/,
  // Real OAuth proxy URLs in .env files (not code comments or examples)
  /^VITE_OAUTH_PROXY_URL=https:\/\/[a-z0-9]+\.execute-api\.[a-z-]+\.amazonaws\.com/m,
  // Real database endpoints
  /DB_HOST=(?!localhost|your-db-host|placeholder)[a-z0-9-]+\.[a-z0-9]+\.us-[a-z]+-\d+\.rds\.amazonaws\.com/,
  // Real RDS Proxy endpoints
  /RDS_PROXY_ENDPOINT=(?!your-rds-proxy|placeholder)[a-z0-9-]+\.proxy-[a-z0-9]+\.[a-z-]+\d+\.rds\.amazonaws\.com/,
];

const ALLOWED_EXCEPTIONS = [
  // GitHub Actions can contain AWS account IDs for role ARNs
  '.github/workflows/',
  // Documentation files can show examples (but check context)
  'AGENTS.md',
  'README.md',
  'agents.md',
  // Terraform outputs are templates
  'terraform/outputs.tf',
  // The validation script itself contains regex patterns
  'scripts/validate-auth-security.js',
  // .env.example should only have safe placeholders
  '.env.example',
];

const DANGEROUS_FILES = [
  '.env.local',
  '.env.production',
  '.env.staging',
  '.env.development',
  'terraform.tfvars',
  'secrets.auto.tfvars',
  'aws-credentials.json',
  'google-credentials.json',
  '.xcode.env.local',
];

function checkStagedFiles() {
  console.log('🔍 Checking staged files for authentication credentials...\n');

  let hasIssues = false;

  try {
    // Get list of staged files (excluding deletions)
    const stagedFiles = execSync(
      'git diff --cached --name-only --diff-filter=AM',
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter((file) => file.trim());

    if (stagedFiles.length === 0) {
      console.log('ℹ️  No staged files to check.');
      return false;
    }

    // Check for dangerous file names
    for (const file of stagedFiles) {
      const fileName = path.basename(file);
      if (DANGEROUS_FILES.some((dangerous) => fileName.includes(dangerous))) {
        console.error(
          `❌ SECURITY RISK: Attempting to commit dangerous file: ${file}`,
        );
        console.error('   This file may contain authentication credentials.');
        hasIssues = true;
      }
    }

    // Check file contents for dangerous patterns
    for (const file of stagedFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');

        // Check if this file is in allowed exceptions
        const isException = ALLOWED_EXCEPTIONS.some((exception) =>
          file.includes(exception.replace(/\/$/, '')),
        );

        for (const pattern of DANGEROUS_PATTERNS) {
          const matches = content.match(pattern);
          if (matches && !isException) {
            // Additional context checks for false positives
            const line = content.split('\n').find((line) => pattern.test(line));

            // Skip if it's clearly a placeholder or example
            if (
              line &&
              (line.includes('placeholder') ||
                line.includes('your-') ||
                line.includes('example') ||
                line.includes('template') ||
                line.includes('DO-NOT-COMMIT') ||
                line.includes('YOUR-AWS-ACCOUNT-ID') ||
                line.includes('// ') ||
                line.includes('* ') ||
                line.includes('# SECURITY:') ||
                (line.includes('googleClientId') && line.includes('||')))
            ) {
              continue;
            }

            console.error(
              `❌ SECURITY RISK: Found potential credential in ${file}`,
            );
            console.error(`   Pattern matched: ${pattern.source}`);
            console.error(`   Line: ${line?.trim()}`);
            hasIssues = true;
          }
        }
      }
    }

    if (!hasIssues) {
      console.log(
        '✅ Security check passed: No authentication credentials detected.',
      );
    }
  } catch (error) {
    console.error('Error during security validation:', error.message);
    hasIssues = true;
  }

  return hasIssues;
}

if (require.main === module) {
  const hasIssues = checkStagedFiles();

  if (hasIssues) {
    console.error('\n🚨 COMMIT BLOCKED: Security issues detected!');
    console.error('   Please remove credentials before committing.');
    console.error('   See AGENTS.md for authentication security guidelines.');
    process.exit(1);
  } else {
    console.log('\n🔐 Security validation complete.');
    process.exit(0);
  }
}

module.exports = { checkStagedFiles };
