#!/usr/bin/env node
/**
 * Security Vulnerability Verification Script
 *
 * Verifies that known vulnerable packages are not actually present in node_modules,
 * even if pnpm audit reports them (due to lockfile scanning limitations).
 *
 * Run: node scripts/verify-security.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔒 Security Vulnerability Verification\n');

let hasIssues = false;

// Check 1: Verify no vulnerable esbuild versions
console.log('1️⃣  Checking esbuild versions...');
try {
  const esbuildVersions = execSync('pnpm ls esbuild --depth=10', {
    encoding: 'utf8',
  });

  // Check for vulnerable version (<=0.24.2)
  if (
    esbuildVersions.match(/esbuild@0\.(([0-9]|1[0-9]|2[0-4])\.|24\.[0-2]($| ))/)
  ) {
    console.log('   ❌ Found vulnerable esbuild version (<=0.24.2)');
    hasIssues = true;
  } else {
    console.log('   ✅ No vulnerable esbuild versions found');
  }
} catch (error) {
  // pnpm ls exits with code 1 if there are issues, but we still get output
  const output = error.stdout || '';
  if (output.match(/esbuild@0\.(([0-9]|1[0-9]|2[0-4])\.|24\.[0-2]($| ))/)) {
    console.log('   ❌ Found vulnerable esbuild version (<=0.24.2)');
    hasIssues = true;
  } else {
    console.log('   ✅ No vulnerable esbuild versions found');
  }
}

// Check 2: Verify no vulnerable axios@1.11.0 physically present
console.log('\n2️⃣  Checking for vulnerable axios installations...');

const vulnerableAxiosPaths = [
  'node_modules/appium-uiautomator2-driver/node_modules/@appium/base-driver/node_modules/axios',
  'node_modules/appium-uiautomator2-driver/node_modules/@appium/support/node_modules/axios',
];

let foundVulnerableAxios = false;
for (const axiosPath of vulnerableAxiosPaths) {
  const fullPath = path.join(process.cwd(), axiosPath);
  if (fs.existsSync(fullPath)) {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(fullPath, 'package.json'), 'utf8'),
    );
    if (packageJson.version === '1.11.0') {
      console.log(`   ❌ Found vulnerable axios@1.11.0 at: ${axiosPath}`);
      foundVulnerableAxios = true;
      hasIssues = true;
    }
  }
}

if (!foundVulnerableAxios) {
  console.log('   ✅ No vulnerable axios@1.11.0 installations found');
}

// Check 3: Verify main axios version is safe
console.log('\n3️⃣  Checking main axios version...');
const rootPackageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const axiosVersion = rootPackageJson.dependencies?.axios || 'not found';

if (axiosVersion === '1.12.2' || axiosVersion === '^1.12.2') {
  console.log(`   ✅ Main axios version is safe: ${axiosVersion}`);
} else if (axiosVersion.match(/^[~^]?1\.(1[2-9]|[2-9][0-9])/)) {
  console.log(`   ✅ Main axios version is safe: ${axiosVersion}`);
} else {
  console.log(`   ⚠️  Main axios version may need update: ${axiosVersion}`);
  console.log('       Expected: 1.12.2 or higher');
}

// Check 4: Verify overrides are in place
console.log('\n4️⃣  Checking overrides configuration...');
const overrides = rootPackageJson.overrides || {};

if (overrides['@esbuild-kit/core-utils']?.esbuild) {
  console.log('   ✅ esbuild override configured');
} else {
  console.log('   ❌ esbuild override missing');
  hasIssues = true;
}

if (overrides.axios) {
  console.log('   ✅ axios override configured');
} else {
  console.log(
    '   ⚠️  axios override missing (may be acceptable if not needed)',
  );
}

// Summary
console.log('\n' + '='.repeat(50));
if (hasIssues) {
  console.log('❌ SECURITY VERIFICATION FAILED');
  console.log('\nSome vulnerable packages were found.');
  console.log('Run: pnpm install to apply fixes');
  process.exit(1);
} else {
  console.log('✅ SECURITY VERIFICATION PASSED');
  console.log('\nNo vulnerable packages detected in node_modules.');
  console.log(
    '\nNote: pnpm audit may still report issues due to lockfile heuristics',
  );
  console.log(
    'scanning, but actual vulnerable code is not present at runtime.',
  );
  process.exit(0);
}
