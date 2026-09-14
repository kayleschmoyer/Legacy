import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../run-command.js', () => ({ runNx: jest.fn() }));

import {
  resolveTestTargetPlan,
  targetShellJoinsArgs,
} from './resolve-test-target.js';
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

    expect(plan).toEqual({
      kind: 'single',
      target: 'test',
      shellJoinsArgs: false,
    });
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

    expect(plan).toEqual({
      kind: 'single',
      target: 'test',
      shellJoinsArgs: false,
    });
  });

  it('falls back to "single" when the project graph cannot be introspected', async () => {
    mockRunNx.mockRejectedValue(new Error('project not found'));

    const plan = await resolveTestTargetPlan('unknown-project', '/repo');

    expect(plan).toEqual({
      kind: 'single',
      target: 'test',
      shellJoinsArgs: false,
    });
  });

  it('returns "nodeTest" for an nx:run-commands target running node --test (LS-10159)', async () => {
    mockRunNx.mockResolvedValue(
      JSON.stringify({
        targets: {
          test: {
            executor: 'nx:run-commands',
            options: {
              command: 'node --test lib/__tests__/*.test.mjs',
              cwd: '.github/scripts/reviewer',
            },
          },
        },
      }),
    );

    const plan = await resolveTestTargetPlan('ci-reviewer', '/repo');

    expect(plan).toEqual({ kind: 'nodeTest', target: 'test' });
  });

  it('does not treat an nx:run-commands target as node --test when the command lacks --test', async () => {
    mockRunNx.mockResolvedValue(
      JSON.stringify({
        targets: {
          test: {
            executor: 'nx:run-commands',
            options: { command: 'echo no-op' },
          },
        },
      }),
    );

    const plan = await resolveTestTargetPlan('no-op-project', '/repo');

    expect(plan).toEqual({
      kind: 'single',
      target: 'test',
      shellJoinsArgs: false,
    });
  });

  it('introspects a scoped project name instead of falling back (LS-10119)', async () => {
    mockRunNx.mockResolvedValue(
      JSON.stringify({
        targets: {
          test: { executor: '@nx/jest:jest', options: { jestConfig: 'x' } },
        },
      }),
    );

    const plan = await resolveTestTargetPlan('@legacy-sports/video', '/repo');

    expect(plan).toEqual({
      kind: 'single',
      target: 'test',
      shellJoinsArgs: false,
    });
    expect(mockRunNx).toHaveBeenCalledWith(
      ['show', 'project', '@legacy-sports/video', '--json'],
      '/repo',
    );
  });

  it('falls back to "single" without spawning nx for an invalid project name', async () => {
    const plan = await resolveTestTargetPlan(
      'shared-components; rm -rf /',
      '/repo',
    );

    expect(plan).toEqual({
      kind: 'single',
      target: 'test',
      shellJoinsArgs: false,
    });
    expect(mockRunNx).not.toHaveBeenCalled();
  });
});

describe('targetShellJoinsArgs (LS-10153)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports true for an nx:run-script target, whose args are shell-joined', async () => {
    mockRunNx.mockResolvedValue(
      JSON.stringify({
        targets: {
          test: { executor: '@nx/jest:jest' },
          'test:all-files': {
            executor: 'nx:run-script',
            options: { script: 'test:all-files' },
          },
        },
      }),
    );

    await expect(
      targetShellJoinsArgs('db', 'test:all-files', '/repo'),
    ).resolves.toBe(true);
  });

  it.each([
    ['@nx/jest:jest', 'forwards argv untouched'],
    ['nx:run-commands', 'quotes each fragment itself'],
  ])('reports false for %s, which %s', async (executor) => {
    mockRunNx.mockResolvedValue(
      JSON.stringify({ targets: { 'test:web': { executor } } }),
    );

    await expect(
      targetShellJoinsArgs('shared-components', 'test:web', '/repo'),
    ).resolves.toBe(false);
  });

  it('reports false for a target the project does not declare', async () => {
    mockRunNx.mockResolvedValue(
      JSON.stringify({ targets: { test: { executor: '@nx/jest:jest' } } }),
    );

    await expect(
      targetShellJoinsArgs('db', 'test:nope', '/repo'),
    ).resolves.toBe(false);
  });

  it('reports false when the project graph cannot be introspected', async () => {
    mockRunNx.mockRejectedValue(new Error('project not found'));

    await expect(
      targetShellJoinsArgs('unknown-project', 'test:all-files', '/repo'),
    ).resolves.toBe(false);
  });

  it('reports false without spawning nx for an invalid project name', async () => {
    await expect(
      targetShellJoinsArgs('db; rm -rf /', 'test:all-files', '/repo'),
    ).resolves.toBe(false);
    expect(mockRunNx).not.toHaveBeenCalled();
  });
});
