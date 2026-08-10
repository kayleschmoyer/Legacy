import { describe, expect, it } from '@jest/globals';

import { DAEMON_FAILURE_HINT, isDaemonFailure } from './daemon-failure.js';

describe('isDaemonFailure', () => {
  it('detects the exact daemon-failure output from LS-8819', () => {
    const output =
      'Calculating the project graph on the Nx Daemon\n\n NX   Nx Daemon was not able to compute the project graph.\n\nLog file with the error: <worktree>/.nx/workspace-data/d/daemon-error.log\nPlease file an issue at https://github.com/nrwl/nx\nNx Daemon is going to be disabled until you run "nx reset".\n';
    expect(isDaemonFailure(output)).toBe(true);
  });

  it('detects a bare "Nx Daemon was not able to compute the project graph" marker', () => {
    expect(
      isDaemonFailure('Nx Daemon was not able to compute the project graph.'),
    ).toBe(true);
  });

  it('detects a bare "Nx Daemon is going to be disabled" marker', () => {
    expect(
      isDaemonFailure(
        'Nx Daemon is going to be disabled until you run "nx reset".',
      ),
    ).toBe(true);
  });

  it('treats output with no task-completion line as a failure', () => {
    expect(isDaemonFailure('some unrelated truncated output')).toBe(true);
  });

  it('treats output with "Successfully ran target" as a genuine pass', () => {
    expect(
      isDaemonFailure(
        'PASS foo.spec.ts\n\n NX   Successfully ran target test for project foo\n',
      ),
    ).toBe(false);
  });

  it('treats output with "No tasks were run" as a genuine pass (nothing affected)', () => {
    expect(isDaemonFailure(' NX   No tasks were run\n')).toBe(false);
  });
});

describe('DAEMON_FAILURE_HINT', () => {
  it('points at make clean-cache, not the blocked nx reset command', () => {
    expect(DAEMON_FAILURE_HINT).toMatch(/make clean-cache/);
    expect(DAEMON_FAILURE_HINT).not.toMatch(/nx reset/);
  });
});
