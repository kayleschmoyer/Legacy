#!/usr/bin/env node
/**
 * Platform-neutral unit-test runner for web-e2e (LS-8628).
 *
 * The `web-e2e:test` target previously ran
 * `tsx --test apps/web-e2e/src/**\/*.test.ts` via nx:run-commands. On
 * Windows, run-commands spawns its child through cmd.exe, which performs no
 * glob expansion — tsx/node received the literal pattern and exited non-zero
 * ("Could not find 'C:\...\*.test.ts'"), deterministically failing the
 * `make pc` Testing step on any cache miss where web-e2e is affected. On
 * Linux the executor's /bin/sh expanded the glob, so CI stayed green and the
 * breakage was Windows-only.
 *
 * This script expands the pattern in userland (fs.readdirSync recursive — no
 * glob dependency, no shell) and spawns `tsx --test <files...>` directly via
 * process.execPath, so behavior is identical regardless of the spawning
 * shell. Node 20.x cannot expand `--test` glob arguments natively (that
 * landed in Node 21), which is why expansion must happen here.
 *
 * The pc pipeline appends `--passWithNoTests=true` (an nx.json
 * targetDefaults jest option forwarded verbatim by run-commands). It is not
 * a node test runner flag, so it is consumed here: it only controls the
 * empty-match exit code. All other CLI args are forwarded to tsx untouched.
 *
 * `make pc-test`/`make test` also accept a `MAXWORKERS=N` OOM workaround
 * (LS-8666) that the Makefile forwards uniformly to every affected project
 * as a Jest `--maxWorkers=N` flag. web-e2e isn't Jest — Node's `--test`
 * runner has no `--maxWorkers` flag and rejects it outright — so it's
 * translated here to the equivalent `--test-concurrency=N` (LS-9115).
 *
 * Usage:
 *   node apps/web-e2e/scripts/run-unit-tests.mjs [--passWithNoTests[=true|false]] [--maxWorkers=N] [tsx args...]
 *
 * Exit code: the tsx --test exit code; 1 if no test files matched (0 when
 * --passWithNoTests=true).
 */

import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, '..', 'src');

const rawArgs = process.argv.slice(2);
const passWithNoTests = rawArgs.some(
  (a) => a === '--passWithNoTests' || a === '--passWithNoTests=true',
);

let maxWorkers;
const forwardedArgs = [];
for (let i = 0; i < rawArgs.length; i += 1) {
  const arg = rawArgs[i];
  if (arg.startsWith('--passWithNoTests')) continue;
  if (arg.startsWith('--maxWorkers=')) {
    maxWorkers = arg.slice('--maxWorkers='.length);
    continue;
  }
  if (arg === '--maxWorkers') {
    maxWorkers = rawArgs[i + 1];
    i += 1;
    continue;
  }
  forwardedArgs.push(arg);
}
if (maxWorkers) {
  forwardedArgs.push(`--test-concurrency=${maxWorkers}`);
}

const testFiles = readdirSync(srcRoot, { recursive: true })
  .map((entry) => String(entry))
  .filter((entry) => entry.endsWith('.test.ts'))
  .map((entry) => join(srcRoot, entry))
  .sort();

if (testFiles.length === 0) {
  if (passWithNoTests) {
    console.log(
      `No *.test.ts files found under ${srcRoot} — passing (--passWithNoTests).`,
    );
    process.exit(0);
  }
  console.error(`No *.test.ts files found under ${srcRoot}.`);
  process.exit(1);
}

console.log(
  `Running ${testFiles.length} test file(s) under ${srcRoot} via tsx --test`,
);

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
// Pin the tsconfig explicitly: tsx resolves the nearest tsconfig.json by
// walking up from process.cwd(), not from the test files' location. The
// `web-e2e:test` target runs with cwd at the workspace root, so without this
// flag tsx picks up the root tsconfig.json (extends expo/tsconfig.base, no
// @legacy-sports/* path aliases) instead of apps/web-e2e/tsconfig.json.
const tsconfigPath = join(__dirname, '..', 'tsconfig.json');

const result = spawnSync(
  process.execPath,
  [
    tsxCli,
    '--tsconfig',
    tsconfigPath,
    '--test',
    ...forwardedArgs,
    ...testFiles,
  ],
  { stdio: 'inherit' },
);

if (result.error) {
  console.error(`Failed to spawn tsx: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
