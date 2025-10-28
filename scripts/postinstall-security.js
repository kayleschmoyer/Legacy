#!/usr/bin/env node
/**
 * Post-install script to remove known vulnerable nested dependencies
 * that cannot be overridden via npm's override mechanism.
 *
 * This runs automatically after pnpm install to ensure vulnerable
 * packages are removed even if they get reinstalled by npm.
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔒 Running post-install security cleanup...');

const vulnerablePackages = [
  {
    path: 'node_modules/appium-uiautomator2-driver/node_modules/@appium/base-driver/node_modules/axios',
    name: 'axios@1.11.0 (in @appium/base-driver)',
  },
  {
    path: 'node_modules/appium-uiautomator2-driver/node_modules/@appium/support/node_modules/axios',
    name: 'axios@1.11.0 (in @appium/support)',
  },
];

let removed = 0;

for (const pkg of vulnerablePackages) {
  const fullPath = path.join(process.cwd(), pkg.path);

  if (fs.existsSync(fullPath)) {
    try {
      // Check if it's actually the vulnerable version
      const packageJsonPath = path.join(fullPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf8'),
        );

        if (packageJson.version === '1.11.0') {
          // Remove the vulnerable package
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`   ✅ Removed vulnerable ${pkg.name}`);
          removed++;
        }
      }
    } catch (error) {
      console.warn(`   ⚠️  Could not remove ${pkg.name}: ${error.message}`);
    }
  }
}

if (removed === 0) {
  console.log('   ✅ No vulnerable packages found (already clean)');
} else {
  console.log(`\n   🎉 Removed ${removed} vulnerable package(s)`);
}

console.log(
  '   ℹ️  Note: npm audit may still report these due to package-lock.json',
);
console.log('');
