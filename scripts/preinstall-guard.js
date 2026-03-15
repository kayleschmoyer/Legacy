// Pre-install guard: abort if node_modules is a Windows NTFS junction.
// Junctioned node_modules are shared across worktrees — mutating them
// breaks every other worktree that points to the same physical directory.
//
// This runs as a "preinstall" lifecycle script before pnpm touches anything.
// It catches both `pnpm install` and `make install` (which calls pnpm).

const fs = require('fs');
const path = require('path');

const nmPath = path.join(__dirname, '..', 'node_modules');

try {
  // readlinkSync succeeds only for junctions and symlinks.
  // For a real directory it throws EINVAL / UNKNOWN.
  const target = fs.readlinkSync(nmPath);
  console.error('');
  console.error('='.repeat(70));
  console.error(' BLOCKED: node_modules is a junction (shared with main repo)');
  console.error('='.repeat(70));
  console.error('');
  console.error(' Target: ' + target);
  console.error('');
  console.error(' Running pnpm install here would mutate the shared');
  console.error(' node_modules and break every other junctioned worktree.');
  console.error('');
  console.error(' To fix:');
  console.error('   1. Remove the junction:  cmd /c "rmdir node_modules"');
  console.error('   2. Re-run:               make install');
  console.error('   -- or --');
  console.error(
    '   Re-run worktree setup:   make wt-setup WT=' +
      __dirname.replace(/[\\/]scripts$/, ''),
  );
  console.error('');
  console.error('='.repeat(70));
  process.exit(1);
} catch {
  // EINVAL / ENOENT / UNKNOWN = not a junction. Allow install.
}
