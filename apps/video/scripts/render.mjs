#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { getCcrHeadlessShellPath } from './ccr-sandbox.mjs';

// The same CCR sandbox that requires the headless-shell override in
// remotion.config.ts also routes outbound HTTPS through a proxy with a CA
// the browser doesn't trust, so @remotion/google-fonts's font fetches fail
// with net::ERR_CERT_AUTHORITY_INVALID (LS-8919).
//
// Config.setChromiumIgnoreCertificateErrors() in remotion.config.ts can't
// fix this: the Remotion CLI re-parses its command line after loading the
// config file, and that re-parse injects an explicit `false` for this flag,
// which then wins over the config-set value. Passing --ignore-certificate-errors
// on the actual command line is the only path that survives, so it's applied
// here rather than in the config file, and only in the CCR sandbox.
const extraArgs = getCcrHeadlessShellPath()
  ? ['--ignore-certificate-errors']
  : [];

const result = spawnSync(
  'remotion',
  ['render', ...process.argv.slice(2), ...extraArgs],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
