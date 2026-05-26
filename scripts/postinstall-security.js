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

// Clean up pnpm temp @types directories left behind by interrupted installs.
//
// When pnpm install fails mid-way (e.g. EPERM on a locked native module),
// it leaves node_tmp_XXXXX directories in node_modules/@types/. TypeScript's
// implicit type library resolution picks them up and fails with TS2688
// ("Cannot find type definition file for 'node_tmp_XXXXX'").
//
// We clean two locations:
//   1. The current repo's node_modules/@types/ (always)
//   2. The parent repo's node_modules/@types/ if running inside a worktree
//      — covers the case where a symlinked install dirtied the main repo
//        before being blocked.
(function cleanPnpmTempTypes() {
  const atTypesDirs = [path.join(process.cwd(), 'node_modules', '@types')];

  // Detect worktree path pattern: …/.claude/worktrees/<name>
  const worktreeMatch = process
    .cwd()
    .match(/^(.+)[/\\]\.claude[/\\]worktrees[/\\][^/\\]+$/);
  if (worktreeMatch) {
    atTypesDirs.push(path.join(worktreeMatch[1], 'node_modules', '@types'));
  }

  let cleaned = 0;
  for (const dir of atTypesDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (/^node_tmp_\d+$/.test(entry)) {
        try {
          fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
          cleaned++;
        } catch {
          // best-effort — don't fail postinstall over a cleanup miss
        }
      }
    }
  }

  if (cleaned > 0) {
    console.log(`   🧹 Removed ${cleaned} stale pnpm temp @types dir(s)`);
  }
})();

// Fix Tamagui installation issue (see scripts/fix-tamagui-install.js)
try {
  require('./fix-tamagui-install.js');
} catch (error) {
  console.warn('⚠️  Tamagui fix script failed:', error.message);
}
