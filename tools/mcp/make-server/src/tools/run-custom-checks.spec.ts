import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// run-command.ts uses import.meta.url (getRepoRoot), which is incompatible
// with the commonjs tsconfig Jest uses here — same workaround as
// validate-pr.spec.ts / run-target.spec.ts. runCommand is re-implemented with
// a plain execFile call (no import.meta) so tests exercise real process spawns
// against real fixture scripts rather than a canned mock return value.
let repoRoot = '/tmp/fake-repo-root';
jest.mock('../run-command.js', () => {
  const { execFile } =
    jest.requireActual<typeof import('node:child_process')>(
      'node:child_process',
    );
  return {
    getRepoRoot: jest.fn(() => repoRoot),
    runCommand: (
      command: string,
      args: string[],
      cwd: string,
      timeoutMs = 300_000,
      shell = true,
      maxBuffer = 10 * 1024 * 1024,
    ) =>
      new Promise((resolve, reject) => {
        execFile(
          command,
          args,
          { cwd, timeout: timeoutMs, shell, maxBuffer, windowsHide: true },
          (err: unknown, stdout: string, stderr: string) => {
            if (err) {
              const parts = [stdout?.trim(), stderr?.trim()].filter(Boolean);
              reject(new Error(parts.join('\n') || (err as Error).message));
              return;
            }
            resolve(stdout.trim());
          },
        );
      }),
  };
});

import { runCustomChecks } from './run-custom-checks.js';

/** Pull the parsed JSON payload out of a ToolResult's text content. */
function payload(result: {
  content: Array<{ text: string }>;
}): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

function writeCheckScript(checksDir: string, name: string, body: string) {
  const scriptPath = join(checksDir, name);
  writeFileSync(
    scriptPath,
    `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`,
  );
  chmodSync(scriptPath, 0o755);
}

describe('runCustomChecks', () => {
  let workDir: string;
  let checksDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'run-custom-checks-test-'));
    repoRoot = workDir;
    checksDir = join(workDir, '.github', 'checks');
    mkdirSync(checksDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  afterEach(() => {
    for (const f of ['a-pass-tests.sh', 'b-fail-tests.sh', 'c-pass-tests.sh']) {
      rmSync(join(checksDir, f), { force: true });
    }
  });

  it('returns an empty passing result when no check scripts exist', async () => {
    const result = await runCustomChecks({});
    expect(result.isError).toBeFalsy();
    const body = payload(result);
    expect(body.total).toBe(0);
    expect(body.allPassed).toBe(true);
    expect(body.results).toEqual([]);
  });

  it('discovers and runs all scripts, reporting pass/fail per script', async () => {
    writeCheckScript(checksDir, 'a-pass-tests.sh', 'echo "a passed"');
    writeCheckScript(
      checksDir,
      'b-fail-tests.sh',
      'echo "about to fail"; exit 1',
    );

    const result = await runCustomChecks({ verbosity: 'full' });
    expect(result.isError).toBe(true); // one of two scripts failed
    const body = payload(result) as {
      total: number;
      passed: number;
      failed: number;
      allPassed: boolean;
      results: Array<{ script: string; passed: boolean; output: string }>;
    };
    expect(body.total).toBe(2);
    expect(body.passed).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.allPassed).toBe(false);

    // Both scripts ran even though the first alphabetically passed and the
    // second failed — unlike the CI step, failure does not short-circuit
    // remaining scripts.
    const byName = Object.fromEntries(body.results.map((r) => [r.script, r]));
    expect(byName['a-pass-tests.sh'].passed).toBe(true);
    expect(byName['a-pass-tests.sh'].output).toContain('a passed');
    expect(byName['b-fail-tests.sh'].passed).toBe(false);
  });

  it('runs a named subset via the scripts filter, accepting names with or without .sh', async () => {
    writeCheckScript(checksDir, 'a-pass-tests.sh', 'echo "a passed"');
    writeCheckScript(checksDir, 'c-pass-tests.sh', 'echo "c passed"');

    const result = await runCustomChecks({
      scripts: ['a-pass-tests', 'c-pass-tests.sh'],
    });
    expect(result.isError).toBeFalsy();
    const body = payload(result) as { total: number; allPassed: boolean };
    expect(body.total).toBe(2);
    expect(body.allPassed).toBe(true);
  });

  it('errors clearly on an unknown script name instead of silently no-oping', async () => {
    writeCheckScript(checksDir, 'a-pass-tests.sh', 'echo "a passed"');

    const result = await runCustomChecks({ scripts: ['does-not-exist'] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown check script');
    expect(result.content[0].text).toContain('does-not-exist.sh');
  });

  it('rejects a non-absolute worktreePath', async () => {
    const result = await runCustomChecks({ worktreePath: 'relative/path' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('must be an absolute path');
  });

  it('defaults to "failures" verbosity: omits output for passing scripts, keeps it for failing ones', async () => {
    writeCheckScript(checksDir, 'a-pass-tests.sh', 'echo "a passed"');
    writeCheckScript(
      checksDir,
      'b-fail-tests.sh',
      'echo "about to fail"; exit 1',
    );

    const result = await runCustomChecks({});
    const body = payload(result) as {
      verbosity: string;
      results: Array<{ script: string; passed: boolean; output?: string }>;
    };
    expect(body.verbosity).toBe('failures');
    const byName = Object.fromEntries(body.results.map((r) => [r.script, r]));
    expect(byName['a-pass-tests.sh'].output).toBeUndefined();
    expect(byName['b-fail-tests.sh'].output).toContain('about to fail');
  });

  it('"summary" verbosity omits output for every script, passing or failing', async () => {
    writeCheckScript(checksDir, 'a-pass-tests.sh', 'echo "a passed"');
    writeCheckScript(
      checksDir,
      'b-fail-tests.sh',
      'echo "about to fail"; exit 1',
    );

    const result = await runCustomChecks({ verbosity: 'summary' });
    const body = payload(result) as {
      results: Array<{ script: string; passed: boolean; output?: string }>;
    };
    for (const r of body.results) {
      expect(r.output).toBeUndefined();
    }
    // The failing script's name and status survive even with no output.
    const byName = Object.fromEntries(body.results.map((r) => [r.script, r]));
    expect(byName['b-fail-tests.sh'].passed).toBe(false);
  });

  it('"full" verbosity includes output for passing scripts too', async () => {
    writeCheckScript(checksDir, 'a-pass-tests.sh', 'echo "a passed"');

    const result = await runCustomChecks({ verbosity: 'full' });
    const body = payload(result) as {
      results: Array<{ script: string; passed: boolean; output?: string }>;
    };
    expect(body.results[0].output).toContain('a passed');
  });

  it('applies maxOutputChars to capped output', async () => {
    writeCheckScript(
      checksDir,
      'b-fail-tests.sh',
      'printf "%0.sx" {1..1000}; exit 1',
    );

    const result = await runCustomChecks({ maxOutputChars: 100 });
    const body = payload(result) as {
      results: Array<{ script: string; output?: string }>;
    };
    const output = body.results[0].output ?? '';
    expect(output.length).toBeLessThan(300); // capped, plus the omission-notice text
    expect(output).toContain('characters omitted');
  });
});
