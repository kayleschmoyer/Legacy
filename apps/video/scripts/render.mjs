#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Run the Remotion CLI's JS entry point with this Node binary instead of
// spawning the bare `remotion` command. On Windows the node_modules/.bin shim
// is `remotion.CMD`, which a shell-less spawnSync cannot resolve (ENOENT), so
// the build used to exit 1 with no output. Resolving through Node's module
// resolution also works with the hoisted/symlinked modules-pool layout, where
// apps/video has no node_modules of its own.
const require = createRequire(import.meta.url);
const cliPackageJson = require.resolve('@remotion/cli/package.json');
const { bin } = JSON.parse(readFileSync(cliPackageJson, 'utf-8'));
const cliEntry = join(
  dirname(cliPackageJson),
  typeof bin === 'string' ? bin : bin.remotion,
);

const result = spawnSync(
  process.execPath,
  [cliEntry, 'render', ...process.argv.slice(2)],
  { stdio: 'inherit' },
);

if (result.error) {
  console.error(`Failed to launch the Remotion CLI: ${result.error.message}`);
}

process.exit(result.status ?? 1);
