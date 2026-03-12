#!/usr/bin/env node
/**
 * 🔒 Secret Security Validation Script
 *
 * Validates that no real secrets are committed to git repository.
 * Run this before commits to ensure security compliance.
 */

const fs = require('fs');
const path = require('path');

// 🚨 Patterns that indicate real secrets (not placeholders)
const DANGEROUS_PATTERNS = {
  JWT_SECRET: {
    pattern:
      /JWT_SECRET=(?!your-jwt-secret|placeholder|REPLACE_WITH_ACTUAL|DO-NOT-COMMIT|your-local-jwt)[A-Za-z0-9+/]{20,}/,
    description: 'Real JWT signing key detected',
  },
  COOKIE_SECRET: {
    pattern:
      /COOKIE_SECRET=(?!your-cookie-secret|placeholder|REPLACE_WITH_ACTUAL|DO-NOT-COMMIT|your-local-cookie)[A-Za-z0-9+/=]{20,}/,
    description: 'Real cookie signing secret detected',
  },
  GOOGLE_OAUTH_CLIENT_SECRET: {
    pattern:
      /GOOGLE_OAUTH_CLIENT_SECRET=(?!REPLACE_WITH_ACTUAL|your-secret|placeholder|your-google-oauth|DO-NOT-COMMIT)GOCSPX-[A-Za-z0-9_-]+/,
    description: 'Real Google OAuth client secret detected',
  },
  AWS_ACCOUNT_ID_IN_URL: {
    pattern: /amazonaws\.com\/\d{12}\//,
    description: 'AWS Account ID in URL detected',
  },
  PRODUCTION_DATABASE: {
    pattern:
      /DB_HOST=(?!localhost|your-db-host|placeholder)[a-z0-9-]+\.[a-z0-9]+\.us-[a-z]+-\d+\.rds\.amazonaws\.com/,
    description: 'Production database endpoint detected',
  },
  PRODUCTION_RDS_PROXY: {
    pattern:
      /RDS_PROXY_ENDPOINT=(?!your-rds-proxy|placeholder)[a-z0-9-]+\.proxy-[a-z0-9]+\.[a-z-]+\d+\.rds\.amazonaws\.com/,
    description: 'Production RDS Proxy endpoint detected',
  },
  PRODUCTION_SQS: {
    pattern: /SQS.*URL=https:\/\/sqs\.[a-z-]+\d+\.amazonaws\.com\/\d{12}\//,
    description: 'Production SQS queue with account ID detected',
  },
};

// ✅ Safe placeholder patterns
const SAFE_PLACEHOLDERS = [
  'your-jwt-secret',
  'your-cookie-secret',
  'your-google-oauth',
  'placeholder-secret',
  'REPLACE_WITH_ACTUAL',
  'DO-NOT-COMMIT',
  'YOUR-AWS-ACCOUNT-ID',
  'your-google-client-id',
  'your-db-host',
  'your-rds-proxy',
  'localhost',
  'example.com',
  '# SECURITY:',
];

function validateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations = [];
  const isLocalEnv = filePath.includes('.env.local');
  const lines = content.split('\n');

  Object.entries(DANGEROUS_PATTERNS).forEach(
    ([name, { pattern, description }]) => {
      const matches = content.match(pattern);
      if (matches) {
        // Find which line contains the match
        const lineIndex = lines.findIndex((line) => pattern.test(line));
        const line = lineIndex >= 0 ? lines[lineIndex] : '';

        // Check if it's a safe placeholder or has security warning
        const isSafe = SAFE_PLACEHOLDERS.some(
          (placeholder) =>
            matches[0].includes(placeholder) || line.includes(placeholder),
        );

        // Skip validation for .env.local files (they are gitignored)
        if (isLocalEnv) {
          return; // .env.local files are allowed to have real values since they're gitignored
        }

        if (!isSafe) {
          violations.push({
            type: name,
            description,
            match: matches[0],
            line: lineIndex + 1,
          });
        }
      }
    },
  );

  return violations;
}

function getStagedFiles() {
  try {
    const { execSync } = require('child_process');
    const output = execSync('git diff --cached --name-only', {
      encoding: 'utf8',
    });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    console.warn(
      '⚠️  Could not get staged files, checking common env files instead',
    );
    return ['.env.example', '.env.production.example', 'apps/web/.env.example'];
  }
}

function validateGitCommit() {
  const stagedFiles = getStagedFiles();
  const envFilesToCheck = stagedFiles.filter(
    (file) =>
      file.includes('.env') &&
      !file.includes('.env.local') && // Skip .env.local files (always gitignored)
      !file.includes('node_modules'),
  );

  console.log('🔒 Validating secrets before commit...\n');

  if (envFilesToCheck.length === 0) {
    console.log(
      '📄 No environment files in this commit - skipping validation\n',
    );
    console.log('✅ All files are secure for commit!');
    return;
  }

  let hasViolations = false;

  envFilesToCheck.forEach((relativePath) => {
    const fullPath = path.resolve(relativePath);

    if (fs.existsSync(fullPath)) {
      console.log(`📄 Checking ${relativePath}...`);
      const violations = validateFile(fullPath);

      if (violations.length > 0) {
        hasViolations = true;
        console.log(`❌ SECURITY VIOLATIONS in ${relativePath}:`);

        violations.forEach((violation) => {
          console.log(`   Line ${violation.line}: ${violation.description}`);
          console.log(`   Found: ${violation.match.substring(0, 50)}...`);
        });
        console.log();
      } else {
        console.log(`✅ Safe\n`);
      }
    }
  });

  if (hasViolations) {
    console.log('🚨 COMMIT BLOCKED: Real secrets detected!');
    console.log('');
    console.log('🛠️  Required Actions:');
    console.log('1. Replace real secrets with placeholders in tracked files');
    console.log('2. Move real secrets to .env.local (gitignored)');
    console.log('3. Use AWS Secrets Manager for production secrets');
    console.log('4. Re-run this validation script');
    console.log('');
    process.exit(1);
  }

  console.log('✅ All files are secure for commit!');
}

// Run validation
if (require.main === module) {
  validateGitCommit();
}

module.exports = { validateFile, validateGitCommit };
