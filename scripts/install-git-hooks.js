#!/usr/bin/env node
/**
 * Git Hooks Installation Script
 *
 * Installs security git hooks to prevent accidental secret commits.
 */

const fs = require('fs');
const path = require('path');

const HOOKS_DIR = '.git/hooks';
const SCRIPT_HOOKS_DIR = 'scripts/git-hooks';

function installGitHooks() {
  console.log('🔧 Installing Git Security Hooks...\n');

  // Ensure hooks directory exists
  if (!fs.existsSync(HOOKS_DIR)) {
    console.log(
      '❌ Error: .git/hooks directory not found. Make sure you are in a git repository.',
    );
    process.exit(1);
  }

  // Install pre-commit hook
  const preCommitSource = path.join(SCRIPT_HOOKS_DIR, 'pre-commit');
  const preCommitTarget = path.join(HOOKS_DIR, 'pre-commit');

  if (fs.existsSync(preCommitSource)) {
    fs.copyFileSync(preCommitSource, preCommitTarget);

    // Make executable (Unix-like systems)
    try {
      fs.chmodSync(preCommitTarget, 0o755);
    } catch (e) {
      // Windows doesn't need chmod
    }

    console.log('✅ Pre-commit hook installed');
    console.log(`   Source: ${preCommitSource}`);
    console.log(`   Target: ${preCommitTarget}`);
  } else {
    console.log('❌ Pre-commit hook source file not found');
  }

  console.log('\n🔒 Security hooks installation complete!');
  console.log('\nThe following will now be validated before each commit:');
  console.log('• No real JWT secrets in tracked files');
  console.log('• No real cookie secrets in tracked files');
  console.log('• No production database endpoints in tracked files');
  console.log('• No AWS account IDs in tracked files');
  console.log('• Safe placeholder values only');
  console.log('• Valid YAML syntax in all .yml and .yaml files');
  console.log('• Valid JSON syntax in all .json files');
  console.log('• @legacy-sports packages use workspace protocol (not npm)');
}

// Run installation
if (require.main === module) {
  installGitHooks();
}

module.exports = { installGitHooks };
