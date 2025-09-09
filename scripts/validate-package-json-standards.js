#!/usr/bin/env node

/**
 * NX Package.json Best Practices Validation Script
 *
 * This script ensures that all package.json files in the workspace follow NX best practices:
 * - Proper scoped naming (@legacy-sports/)
 * - Consistent versioning (0.0.1)
 * - Private flag set to true
 * - Proper main/types paths pointing to src/index.ts for libraries
 * - No unnecessary metadata fields
 * - Wildcard dependencies for root-managed packages
 */

const fs = require('fs');
const path = require('path');

const rootPath = process.cwd();

console.log('📦 Validating package.json best practices...\n');

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
    } else if (entry.name === 'package.json' && dir !== rootPath) {
      // Include package.json files except the root one
      files.push(path.relative(rootPath, fullPath));
    }
  }

  return files;
}

const packageJsonFiles = findPackageJsonFiles(rootPath);
console.log(
  `Found ${packageJsonFiles.length} workspace package.json files to validate`,
);

// Get root package.json dependencies
const rootPackageJsonPath = path.join(rootPath, 'package.json');
const rootPackageJson = JSON.parse(
  fs.readFileSync(rootPackageJsonPath, 'utf8'),
);
const rootDeps = {
  ...(rootPackageJson.dependencies || {}),
  ...(rootPackageJson.devDependencies || {}),
};

let issueCount = 0;
let projectCount = 0;

// Define the standards
const EXPECTED_SCOPE = '@legacy-sports/';
const EXPECTED_VERSION = '0.0.1';
const FORBIDDEN_FIELDS = ['description', 'author', 'license'];
const LIBRARY_PATHS = ['./src/index.ts', './src/index.js'];

for (const file of packageJsonFiles) {
  const fullPath = path.join(rootPath, file);
  projectCount++;
  const projectName = path.dirname(file);

  try {
    const packageJson = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    let hasIssues = false;

    // Helper function to log issues
    const logIssue = (message) => {
      if (!hasIssues) {
        console.log(`\n📁 ${projectName}:`);
        hasIssues = true;
      }
      console.log(`  ❌ ${message}`);
      issueCount++;
    };

    // 1. Check scoped naming
    if (!packageJson.name || !packageJson.name.startsWith(EXPECTED_SCOPE)) {
      logIssue(
        `Name should start with "${EXPECTED_SCOPE}" but is "${packageJson.name}"`,
      );
    }

    // 2. Check version
    if (packageJson.version !== EXPECTED_VERSION) {
      logIssue(
        `Version should be "${EXPECTED_VERSION}" but is "${packageJson.version}"`,
      );
    }

    // 3. Check private flag
    if (packageJson.private !== true) {
      logIssue(`Should have "private": true but has "${packageJson.private}"`);
    }

    // 4. Check for forbidden metadata fields
    for (const field of FORBIDDEN_FIELDS) {
      if (packageJson[field] !== undefined) {
        logIssue(
          `Should not contain "${field}" field (value: "${packageJson[field]}")`,
        );
      }
    }

    // 5. Check main/types paths for libraries (not apps with important scripts)
    const isLibrary = projectName.startsWith('lib/');
    const hasImportantScripts =
      packageJson.scripts && Object.keys(packageJson.scripts).length > 0;

    if (isLibrary && !hasImportantScripts) {
      if (!packageJson.main || !LIBRARY_PATHS.includes(packageJson.main)) {
        logIssue(
          `Library should have main pointing to "./src/index.ts" but has "${packageJson.main}"`,
        );
      }
      if (!packageJson.types || !LIBRARY_PATHS.includes(packageJson.types)) {
        logIssue(
          `Library should have types pointing to "./src/index.ts" but has "${packageJson.types}"`,
        );
      }
    }

    // 6. Check dependency wildcards
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};

    for (const [dep, version] of Object.entries(dependencies)) {
      if (rootDeps[dep] && version !== '*') {
        logIssue(`Dependency "${dep}" should use "*" but has "${version}"`);
      }
    }

    for (const [dep, version] of Object.entries(devDependencies)) {
      if (rootDeps[dep] && version !== '*') {
        logIssue(`DevDependency "${dep}" should use "*" but has "${version}"`);
      }
    }

    // 7. Check for empty scripts object
    if (packageJson.scripts && Object.keys(packageJson.scripts).length === 0) {
      logIssue(`Should not have empty scripts object`);
    }

    if (!hasIssues) {
      console.log(`✅ ${projectName}: All standards followed`);
    }
  } catch (error) {
    console.log(`❌ Error reading ${file}: ${error.message}`);
    issueCount++;
  }
}

console.log('\n📋 NX Package.json Best Practices:');
console.log(`1. Use scoped naming: "${EXPECTED_SCOPE}<project-name>"`);
console.log(`2. Set consistent version: "${EXPECTED_VERSION}"`);
console.log('3. Add "private": true to prevent accidental publishing');
console.log('4. Point main/types to "./src/index.ts" for simple libraries');
console.log('5. Remove unnecessary metadata: description, author, license');
console.log('6. Use "*" for dependencies managed in root package.json');
console.log('7. Preserve important scripts but remove empty scripts objects');

console.log('\n📊 Validation Summary:');
console.log(`   Projects validated: ${projectCount}`);
console.log(`   Issues found: ${issueCount}`);
console.log(`   Root dependencies: ${Object.keys(rootDeps).length}`);

if (issueCount > 0) {
  console.log('\n❌ Package.json standards validation failed');
  console.log(
    '\nTo fix these issues, update the package.json files according to the best practices above.',
  );
  process.exit(1);
} else {
  console.log('\n✅ All package.json files follow NX best practices');
  process.exit(0);
}
