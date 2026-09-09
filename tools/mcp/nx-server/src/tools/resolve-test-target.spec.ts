import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../run-command.js', () => ({ runNx: jest.fn() }));

import { resolveTestTargetPlan } from './resolve-test-target.js';
import { runNx } from '../run-command.js';

const mockRunNx = runNx as jest.MockedFunction<typeof runNx>;

describe('resolveTestTargetPlan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns "single" for a project with a plain jest "test" target', async () => {
    mockRunNx.mockResolvedValue(
      JSON.stringify({
        targets: {
          test: { executor: '@nx/jest:jest', options: { jestConfig: 'x' } },
        },
      }),
    );

    const plan = await resolveTestTargetPlan('db', '/repo');

    expect(plan).toEqual({ kind: 'single', target: 'test' });
  });

  it('fans out across jest-executor dependencies of an nx:noop aggregate', async () => {
    mockRunNx.mockResolvedValue(
      JSON.stringify({
        targets: {
          test: { executor: 'nx:noop', dependsOn: ['test:web', 'test:mobile'] },
          'test:web': {
            executor: '@nx/jest:jest',
            options: { jestConfig: 'jest.config.web.ts' },
          },
          'test:mobile': {
            executor: '@nx/jest:jest',
            options: { jestConfig: 'jest.config.mobile.ts' },
          },
        },
      }),
    );

    const plan = await resolveTestTargetPlan('shared-components', '/repo');

    expect(plan).toEqual({
      kind: 'fanout',
      targets: ['test:web', 'test:mobile'],
      skipped: [],
    });
  });

  it('skips non-jest dependencies of an aggregate but still fans out to the jest ones', async () => {
    mockRunNx.mockResolvedValue(
      JSON.stringify({
        targets: {
          test: {
            executor: 'nx:noop',
            dependsOn: ['test:web', 'lint-check'],
          },
          'test:web': {
            executor: '@nx/jest:jest',
            options: { jestConfig: 'jest.config.web.ts' },
          },
          'lint-check': { executor: '@nx/eslint:lint' },
        },
      }),
    );

    const plan = await resolveTestTargetPlan('mixed-project', '/repo');

    expect(plan).toEqual({
      kind: 'fanout',
      targets: ['test:web'],
      skipped: ['lint-check'],
    });
  });

  it('returns an actionable error when an aggregate has no jest-executor dependencies', async () => {
    mockRunNx.mockResolvedValue(
      JSON.stringify({
        targets: {
          test: { executor: 'nx:noop', dependsOn: ['build', 'lint'] },
          build: { executor: '@nx/js:tsc' },
          lint: { executor: '@nx/eslint:lint' },
        },
      }),
    );

    const plan = await resolveTestTargetPlan('no-tests', '/repo');

    expect(plan.kind).toBe('error');
    if (plan.kind === 'error') {
      expect(plan.message).toMatch(/aggregate over build, lint/);
      expect(plan.message).toMatch(/none of which are jest targets/);
    }
  });

  it('falls back to "single" when the project has no "test" target at all', async () => {
    mockRunNx.mockResolvedValue(JSON.stringify({ targets: { build: {} } }));

    const plan = await resolveTestTargetPlan('no-test-target', '/repo');

    expect(plan).toEqual({ kind: 'single', target: 'test' });
  });

  it('falls back to "single" when the project graph cannot be introspected', async () => {
    mockRunNx.mockRejectedValue(new Error('project not found'));

    const plan = await resolveTestTargetPlan('unknown-project', '/repo');

    expect(plan).toEqual({ kind: 'single', target: 'test' });
  });

  it('falls back to "single" without spawning nx for an invalid project name', async () => {
    const plan = await resolveTestTargetPlan(
      'shared-components; rm -rf /',
      '/repo',
    );

    expect(plan).toEqual({ kind: 'single', target: 'test' });
    expect(mockRunNx).not.toHaveBeenCalled();
  });
});
