#!/usr/bin/env node

/**
 * Legacy Sports Package Validation Script
 *
 * This script ensures that all @legacy-sports packages are using pnpm workspace
 * protocol (workspace:*) instead of attempting to install from npm.
 *
 * @legacy-sports packages should never be published to npm and should only be
 * referenced via workspace protocol to ensure proper monorepo dependency management.
 */

const fs = require('fs');
const path = require('path');

const rootPath = process.cwd();

console.log('🔍 Validating @legacy-sports package references...\n');

// Find all package.json files recursively
function findPackageJsonFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules, dist, .nx, etc.
      if (!['node_modules', 'dist', '.nx', '.git'].includes(entry.name)) {
        findPackageJsonFiles(fullPath, files);
      }
    } else if (entry.name === 'package.json') {
      files.push(path.relative(rootPath, fullPath));
    }
  }

  return files;
}

const packageJsonFiles = findPackageJsonFiles(rootPath);

console.log(
  `Found ${packageJsonFiles.length} package.json files to validate\n`,
);

let issueCount = 0;
let fileCount = 0;

for (const file of packageJsonFiles) {
  const fullPath = path.join(rootPath, file);
  fileCount++;
  const projectName = file === 'package.json' ? 'root' : path.dirname(file);

  try {
    const packageJson = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

    // Check dependencies and devDependencies
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};
    const allDeps = { ...dependencies, ...devDependencies };

    let hasIssues = false;

    for (const [dep, version] of Object.entries(allDeps)) {
      // Check if it's a @legacy-sports package
      if (dep.startsWith('@legacy-sports/')) {
        // Valid workspace protocols
        const isValidWorkspaceRef =
          version === 'workspace:*' ||
          version === '*' ||
          version.startsWith('workspace:');

        if (!isValidWorkspaceRef) {
          if (!hasIssues) {
            console.log(`\n📁 ${projectName} (${file}):`);
            hasIssues = true;
          }
          console.log(
            `  ❌ Package "${dep}" is using "${version}" instead of "workspace:*"`,
          );
          issueCount++;
        }
      }
    }
  } catch (error) {
    console.log(`❌ Error reading ${file}: ${error.message}`);
    issueCount++;
  }
}

console.log('\n📋 Summary:');
console.log(`   Package.json files validated: ${fileCount}`);
console.log(`   Issues found: ${issueCount}`);

if (issueCount > 0) {
  console.log('\n❌ Validation failed!');
  console.log('\n🔧 How to fix:');
  console.log(
    '   1. Replace all @legacy-sports package versions with "workspace:*"',
  );
  console.log('   2. Run "pnpm install" to update the lockfile');
  console.log('   3. Commit the changes');
  console.log(
    '\n⚠️  @legacy-sports packages should NEVER be installed from npm!',
  );
  console.log(
    '   They must use pnpm workspace protocol for proper monorepo management.',
  );
  process.exit(1);
} else {
  console.log(
    '\n✅ All @legacy-sports packages are properly configured with workspace protocol',
  );
  process.exit(0);
}
