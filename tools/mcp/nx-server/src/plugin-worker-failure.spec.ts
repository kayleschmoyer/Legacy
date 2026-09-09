import { describe, expect, it } from '@jest/globals';

import {
  isPluginWorkerTimeoutFailure,
  PLUGIN_WORKER_RETRY_EXHAUSTED_HINT,
  PLUGIN_WORKER_TIMEOUT_HINT,
} from './plugin-worker-failure.js';

describe('isPluginWorkerTimeoutFailure', () => {
  it('detects the "Plugin Worker ... did not receive a load message" marker', () => {
    const output =
      'Plugin Worker for /repo/node_modules/nx/dist/src/plugins/js is exiting as it did not receive a load message within 10 seconds of connecting.\n';
    expect(isPluginWorkerTimeoutFailure(output)).toBe(true);
  });

  it('detects the "Failed to load N default Nx plugin(s)" marker', () => {
    const output =
      'Failed to load 3 default Nx plugin(s). This can sometimes be fixed by running `nx reset`, and if the error persists please report the issue.\n\nAll plugin workers exited unexpectedly.\n';
    expect(isPluginWorkerTimeoutFailure(output)).toBe(true);
  });

  it('detects either marker independently of the other', () => {
    expect(
      isPluginWorkerTimeoutFailure(
        'Plugin Worker for @nx/eslint/plugin is exiting as it did not receive a load message within 10 seconds of connecting.',
      ),
    ).toBe(true);
    expect(
      isPluginWorkerTimeoutFailure('Failed to load 6 default Nx plugin(s).'),
    ).toBe(true);
  });

  it('returns false for unrelated failure output', () => {
    expect(
      isPluginWorkerTimeoutFailure(
        "TS2322: Type 'string' is not assignable to type 'number'.",
      ),
    ).toBe(false);
  });

  it('returns false for genuinely passing output', () => {
    expect(
      isPluginWorkerTimeoutFailure(
        'NX   Successfully ran target build for 12 projects',
      ),
    ).toBe(false);
  });
});

describe('plugin worker hints', () => {
  it('the retry hint names the env var workaround', () => {
    expect(PLUGIN_WORKER_TIMEOUT_HINT).toMatch(/NX_ISOLATE_PLUGINS=false/);
  });

  it('the exhausted hint is distinct from the retry-in-progress hint', () => {
    expect(PLUGIN_WORKER_RETRY_EXHAUSTED_HINT).not.toBe(
      PLUGIN_WORKER_TIMEOUT_HINT,
    );
  });
});
