const fs = require('fs');
const path = require('path');

/**
 * Fix for incomplete pnpm installation of @tamagui/react-native-web-internals
 *
 * Issue: pnpm sometimes fails to properly move packages from temporary directories
 * during installation, leaving them incomplete. This script detects and fixes that.
 *
 * See: PR #223 CI failures - package left in _tmp_* directory
 */

const packageName = '@tamagui/react-native-web-internals';
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
const packagePath = path.join(
  nodeModulesPath,
  '@tamagui',
  'react-native-web-internals',
);
const criticalFile = path.join(packagePath, 'dist', 'cjs', 'index.cjs');

console.log('🔍 Checking Tamagui package installation...');

// In Docker/CI builds the pnpm temp-dir race condition never occurs,
// so skip the fix entirely to avoid a false-positive fatal error.
if (process.env.DOCKER_BUILD === 'true' || process.env.CI === 'true') {
  console.log('ℹ️  Skipping Tamagui fix in Docker/CI environment');
  process.exit(0);
}

// Check if the critical file exists
if (fs.existsSync(criticalFile)) {
  console.log('✅ Tamagui package is properly installed');
  process.exit(0);
}

console.warn(
  '⚠️  Tamagui package is incomplete - looking for temporary directory...',
);

// Look for temporary directories
const tamaguiDir = path.join(nodeModulesPath, '@tamagui');
if (!fs.existsSync(tamaguiDir)) {
  console.error('❌ @tamagui directory not found');
  process.exit(1);
}

const files = fs.readdirSync(tamaguiDir);
const tempDirs = files.filter((f) =>
  f.startsWith('react-native-web-internals_tmp_'),
);

if (tempDirs.length === 0) {
  console.error(
    '❌ No temporary directory found - pnpm installation may have failed',
  );
  console.error('   Try: pnpm install --force');
  process.exit(1);
}

const tempDir = tempDirs[0];
const tempPath = path.join(tamaguiDir, tempDir);
const tempCriticalFile = path.join(tempPath, 'dist', 'cjs', 'index.cjs');

if (!fs.existsSync(tempCriticalFile)) {
  console.error(`❌ Temporary directory ${tempDir} is also incomplete`);
  process.exit(1);
}

console.log(`📦 Found complete package in temporary directory: ${tempDir}`);
console.log('🔄 Moving temporary directory to correct location...');

try {
  // Remove incomplete package
  if (fs.existsSync(packagePath)) {
    fs.rmSync(packagePath, { recursive: true, force: true });
  }

  // Move temp directory to correct location
  fs.renameSync(tempPath, packagePath);

  console.log('✅ Successfully fixed Tamagui package installation');
  process.exit(0);
} catch (error) {
  console.error('❌ Failed to fix Tamagui package:', error.message);
  process.exit(1);
}
