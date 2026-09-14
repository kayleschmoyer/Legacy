import { describe, expect, it, jest } from '@jest/globals';

jest.mock('./run-target.js', () => ({ runTarget: jest.fn() }));
jest.mock('./resolve-test-target.js', () => ({
  resolveTestTargetPlan: jest.fn(),
  targetShellJoinsArgs: jest.fn(),
}));
jest.mock('../run-command.js', () => ({ getRepoRoot: jest.fn(() => '/repo') }));

import { runTest } from './run-test.js';
import { runTarget } from './run-target.js';
import {
  resolveTestTargetPlan,
  targetShellJoinsArgs,
} from './resolve-test-target.js';
import type { ToolResult } from '../types.js';

const mockRunTarget = runTarget as jest.MockedFunction<typeof runTarget>;
const mockResolveTestTargetPlan = resolveTestTargetPlan as jest.MockedFunction<
  typeof resolveTestTargetPlan
>;
const mockTargetShellJoinsArgs = targetShellJoinsArgs as jest.MockedFunction<
  typeof targetShellJoinsArgs
>;

function stubResult(): ToolResult {
  return { content: [{ type: 'text', text: '{}' }] };
}

describe('runTest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunTarget.mockResolvedValue(stubResult());
    mockResolveTestTargetPlan.mockResolvedValue({
      kind: 'single',
      target: 'test',
      shellJoinsArgs: false,
    });
    mockTargetShellJoinsArgs.mockResolvedValue(false);
  });

  it('maps config to a colon-suffixed target without consulting the target plan', async () => {
    await runTest({
      project: 'shared-components',
      config: 'mobile',
      testPathPatterns: 'LeagueListRow',
    });

    expect(mockRunTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        project: 'shared-components',
        target: 'test:mobile',
        args: ['--testPathPatterns', 'LeagueListRow'],
      }),
    );
    expect(mockResolveTestTargetPlan).not.toHaveBeenCalled();
  });

  it('falls back to the bare "test" target when config is omitted and the plan is "single"', async () => {
    await runTest({ project: 'db', testPathPatterns: 'delete-resilience' });

    expect(mockResolveTestTargetPlan).toHaveBeenCalledWith('db', '/repo');
    expect(mockRunTarget).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'db', target: 'test' }),
    );
  });

  it('forwards updateSnapshot, noCache, and worktreePath', async () => {
    await runTest({
      project: 'shared-components',
      config: 'web',
      testPathPatterns: 'LeagueListRow',
      updateSnapshot: true,
      noCache: true,
      worktreePath: '/repo/worktree',
    });

    expect(mockRunTarget).toHaveBeenCalledWith({
      project: 'shared-components',
      target: 'test:web',
      noCache: true,
      updateSnapshot: true,
      args: ['--testPathPatterns', 'LeagueListRow'],
      worktreePath: '/repo/worktree',
    });
  });

  it('forwards testNamePattern as --testNamePattern after --testPathPatterns', async () => {
    await runTest({
      project: 'app',
      config: 'mobile',
      testPathPatterns: 'DraftSquadStrip.native.spec.tsx',
      testNamePattern: 'DraftSquadStrip',
    });

    expect(mockRunTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        project: 'app',
        target: 'test:mobile',
        args: [
          '--testPathPatterns',
          'DraftSquadStrip.native.spec.tsx',
          '--testNamePattern',
          'DraftSquadStrip',
        ],
      }),
    );
  });

  it('omits --testNamePattern when not given', async () => {
    await runTest({
      project: 'shared-components',
      config: 'web',
      testPathPatterns: 'LeagueListRow',
    });

    expect(mockRunTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['--testPathPatterns', 'LeagueListRow'],
      }),
    );
  });

  it('passes through the runTarget result unchanged for the "single" plan', async () => {
    const expected: ToolResult = {
      content: [{ type: 'text', text: '{"passed":true}' }],
    };
    mockRunTarget.mockResolvedValue(expected);

    const result = await runTest({
      project: 'shared-components',
      config: 'mobile',
      testPathPatterns: 'LeagueListRow',
    });

    expect(result).toBe(expected);
  });

  it('errors without calling runTarget when testPathPatterns is missing for a "single" Jest plan', async () => {
    const result = await runTest({ project: 'db' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/testPathPatterns is required/);
    expect(mockRunTarget).not.toHaveBeenCalled();
  });

  it('errors without calling runTarget when testPathPatterns is missing for a "fanout" plan', async () => {
    mockResolveTestTargetPlan.mockResolvedValue({
      kind: 'fanout',
      targets: ['test:web', 'test:mobile'],
      skipped: [],
    });

    const result = await runTest({ project: 'shared-components' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/testPathPatterns is required/);
    expect(mockRunTarget).not.toHaveBeenCalled();
  });

  it('errors without calling runTarget when testPathPatterns is missing for config', async () => {
    const result = await runTest({
      project: 'shared-components',
      config: 'mobile',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/testPathPatterns is required/);
    expect(mockRunTarget).not.toHaveBeenCalled();
    expect(mockResolveTestTargetPlan).not.toHaveBeenCalled();
  });

  it('returns the error message and never calls runTarget when the plan is "error"', async () => {
    mockResolveTestTargetPlan.mockResolvedValue({
      kind: 'error',
      message:
        '"no-tests"\'s "test" target is an aggregate over build, lint, none of which are jest targets — testPathPatterns cannot be forwarded to it.',
    });

    const result = await runTest({
      project: 'no-tests',
      testPathPatterns: 'Foo',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/none of which are jest targets/);
    expect(mockRunTarget).not.toHaveBeenCalled();
  });

  it('fans testPathPatterns out across every jest target and merges the results (LS-9886)', async () => {
    mockResolveTestTargetPlan.mockResolvedValue({
      kind: 'fanout',
      targets: ['test:web', 'test:mobile'],
      skipped: [],
    });
    mockRunTarget.mockImplementation((params) => {
      const passed = params.target === 'test:web';
      return Promise.resolve({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              project: params.project,
              target: params.target,
              passed,
            }),
          },
        ],
        ...(passed ? {} : { isError: true }),
      });
    });

    const result = await runTest({
      project: 'shared-components',
      testPathPatterns: 'DraftOrderRailPanel|DraftDetailsPanel|DraftRail',
    });

    expect(mockRunTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        project: 'shared-components',
        target: 'test:web',
        args: [
          '--testPathPatterns',
          'DraftOrderRailPanel|DraftDetailsPanel|DraftRail',
        ],
      }),
    );
    expect(mockRunTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        project: 'shared-components',
        target: 'test:mobile',
        args: [
          '--testPathPatterns',
          'DraftOrderRailPanel|DraftDetailsPanel|DraftRail',
        ],
      }),
    );

    const parsed = JSON.parse(result.content[0].text) as {
      project: string;
      targets: string[];
      passed: boolean;
      results: Record<string, { passed: boolean }>;
    };
    expect(parsed.project).toBe('shared-components');
    expect(parsed.targets).toEqual(['test:web', 'test:mobile']);
    // one fanned-out target failed -> the merged result must not report an
    // overall pass, which is exactly the false-signal this ticket fixes.
    expect(parsed.passed).toBe(false);
    expect(result.isError).toBe(true);
    expect(parsed.results['test:web'].passed).toBe(true);
    expect(parsed.results['test:mobile'].passed).toBe(false);
  });

  it('reports passed:true when every fanned-out target passes', async () => {
    mockResolveTestTargetPlan.mockResolvedValue({
      kind: 'fanout',
      targets: ['test:web', 'test:mobile'],
      skipped: ['test:stories'],
    });
    mockRunTarget.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ passed: true }) }],
    });

    const result = await runTest({
      project: 'shared-components',
      testPathPatterns: 'LeagueListRow',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text) as {
      passed: boolean;
      skippedNonJestTargets: string[];
    };
    expect(parsed.passed).toBe(true);
    expect(parsed.skippedNonJestTargets).toEqual(['test:stories']);
  });
});

describe('runTest node --test target (LS-10159)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunTarget.mockResolvedValue(stubResult());
    mockResolveTestTargetPlan.mockResolvedValue({
      kind: 'nodeTest',
      target: 'test',
    });
    mockTargetShellJoinsArgs.mockResolvedValue(false);
  });

  it('appends files as positional args instead of --testPathPatterns', async () => {
    await runTest({
      project: 'ci-reviewer',
      files: [
        'lib/__tests__/retry.test.mjs',
        'lib/__tests__/multi-pass.test.mjs',
      ],
    });

    expect(mockRunTarget).toHaveBeenCalledWith({
      project: 'ci-reviewer',
      target: 'test',
      noCache: undefined,
      args: [
        'lib/__tests__/retry.test.mjs',
        'lib/__tests__/multi-pass.test.mjs',
      ],
      worktreePath: undefined,
    });
  });

  it('errors without calling runTarget when files is missing', async () => {
    const result = await runTest({ project: 'ci-reviewer' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/node --test/);
    expect(result.content[0].text).toMatch(/files: string\[\]/);
    expect(mockRunTarget).not.toHaveBeenCalled();
  });

  it('errors without calling runTarget when files is an empty array', async () => {
    const result = await runTest({ project: 'ci-reviewer', files: [] });

    expect(result.isError).toBe(true);
    expect(mockRunTarget).not.toHaveBeenCalled();
  });

  it('does not require testPathPatterns for a nodeTest plan', async () => {
    const result = await runTest({
      project: 'ci-reviewer',
      files: ['lib/__tests__/retry.test.mjs'],
    });

    expect(result.isError).toBeUndefined();
    expect(mockRunTarget).toHaveBeenCalled();
  });
});

describe('runTest testPathPatterns validation (ReDoS mitigation)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunTarget.mockResolvedValue(stubResult());
    mockResolveTestTargetPlan.mockResolvedValue({
      kind: 'single',
      target: 'test',
      shellJoinsArgs: false,
    });
    mockTargetShellJoinsArgs.mockResolvedValue(false);
  });

  it('rejects a testPathPatterns value over the length cap without calling runTarget', async () => {
    const result = await runTest({
      project: 'shared-components',
      testPathPatterns: 'a'.repeat(301),
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/exceeds 300 characters/);
    expect(mockRunTarget).not.toHaveBeenCalled();
  });

  it('allows a testPathPatterns value exactly at the length cap', async () => {
    const result = await runTest({
      project: 'shared-components',
      testPathPatterns: 'a'.repeat(300),
    });

    expect(result.isError).toBeUndefined();
    expect(mockRunTarget).toHaveBeenCalled();
  });

  it('rejects a classic nested-quantifier ReDoS shape like "(a+)+"', async () => {
    const result = await runTest({
      project: 'shared-components',
      testPathPatterns: '(a+)+',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/nested-quantifier/);
    expect(mockRunTarget).not.toHaveBeenCalled();
  });

  it('rejects "(a*)*"', async () => {
    const result = await runTest({
      project: 'shared-components',
      testPathPatterns: '(a*)*',
    });

    expect(result.isError).toBe(true);
    expect(mockRunTarget).not.toHaveBeenCalled();
  });

  it('allows a normal pipe-separated multi-pattern value', async () => {
    const result = await runTest({
      project: 'shared-components',
      testPathPatterns: 'LeagueListRow|RosterCard|MatchupHeader',
    });

    expect(result.isError).toBeUndefined();
    expect(mockRunTarget).toHaveBeenCalled();
  });

  it('allows Expo Router route-group parens with a single quantifier', async () => {
    const result = await runTest({
      project: 'app',
      testPathPatterns: '(app)/(tabs)/players.spec',
    });

    expect(result.isError).toBeUndefined();
    expect(mockRunTarget).toHaveBeenCalled();
  });

  it('rejects a testNamePattern value over the length cap without calling runTarget', async () => {
    const result = await runTest({
      project: 'shared-components',
      testPathPatterns: 'LeagueListRow',
      testNamePattern: 'a'.repeat(301),
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(
      /testNamePattern exceeds 300 characters/,
    );
    expect(mockRunTarget).not.toHaveBeenCalled();
  });

  it('rejects a nested-quantifier ReDoS shape in testNamePattern', async () => {
    const result = await runTest({
      project: 'shared-components',
      testPathPatterns: 'LeagueListRow',
      testNamePattern: '(a+)+',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(
      /testNamePattern.*nested-quantifier/,
    );
    expect(mockRunTarget).not.toHaveBeenCalled();
  });

  it('allows a normal testNamePattern value', async () => {
    const result = await runTest({
      project: 'shared-components',
      testPathPatterns: 'LeagueListRow',
      testNamePattern: 'renders the league name',
    });

    expect(result.isError).toBeUndefined();
    expect(mockRunTarget).toHaveBeenCalled();
  });
});

describe('runTest report mode (LS-10092)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunTarget.mockResolvedValue(stubResult());
    mockResolveTestTargetPlan.mockResolvedValue({
      kind: 'single',
      target: 'test',
      shellJoinsArgs: false,
    });
    mockTargetShellJoinsArgs.mockResolvedValue(false);
  });

  it('does not pass jestReport when report is omitted', async () => {
    await runTest({ project: 'web', testPathPatterns: 'Foo' });

    expect(mockRunTarget).toHaveBeenCalledWith(
      expect.not.objectContaining({ jestReport: expect.anything() }),
    );
  });

  it('forwards the requested mode with a unique per-target output file', async () => {
    await runTest({
      project: 'web',
      testPathPatterns: 'Foo',
      report: 'summary',
    });

    const call = mockRunTarget.mock.calls[0][0] as {
      jestReport?: { mode: string; outputFile: string };
    };
    expect(call.jestReport?.mode).toBe('summary');
    expect(call.jestReport?.outputFile).toMatch(/nx-mcp-jest-report-.*\.json$/);
  });

  it('gives each fanned-out target its own report file', async () => {
    mockResolveTestTargetPlan.mockResolvedValue({
      kind: 'fanout',
      targets: ['test:web', 'test:mobile'],
      skipped: [],
    });

    await runTest({
      project: 'shared-components',
      testPathPatterns: 'Foo',
      report: 'json',
    });

    const files = mockRunTarget.mock.calls.map(
      (call) =>
        (call[0] as { jestReport?: { outputFile: string } }).jestReport
          ?.outputFile,
    );
    expect(files).toHaveLength(2);
    expect(files[0]).not.toBe(files[1]);
  });

  it('rolls per-target failure lists up to the top level', async () => {
    mockResolveTestTargetPlan.mockResolvedValue({
      kind: 'fanout',
      targets: ['test:web', 'test:mobile'],
      skipped: [],
    });
    mockRunTarget
      .mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              passed: false,
              numTotalTests: 5,
              numPassedTests: 4,
              numFailedTests: 1,
              numFailedTestSuites: 1,
              failures: [
                { suite: 'a.spec.ts', fullName: 'a fails', message: 'x' },
              ],
            }),
          },
        ],
        isError: true,
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              passed: true,
              numTotalTests: 3,
              numPassedTests: 3,
              numFailedTests: 0,
              numFailedTestSuites: 0,
              failures: [],
            }),
          },
        ],
      });

    const result = await runTest({
      project: 'shared-components',
      testPathPatterns: 'Foo',
      report: 'summary',
    });

    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(body.passed).toBe(false);
    expect(body.numTotalTests).toBe(8);
    expect(body.numPassedTests).toBe(7);
    expect(body.numFailedTests).toBe(1);
    expect(body.failures).toEqual([
      { suite: 'a.spec.ts', fullName: 'a fails', message: 'x' },
    ]);
    // Rolled up once, not billed again inside each per-target result.
    const perTarget = body.results as Record<string, Record<string, unknown>>;
    expect(perTarget['test:web'].failures).toBeUndefined();
    expect(perTarget['test:web'].numFailedTests).toBe(1);
  });

  it('omits the roll-up when no target produced a parsed report', async () => {
    mockResolveTestTargetPlan.mockResolvedValue({
      kind: 'fanout',
      targets: ['test:web'],
      skipped: [],
    });
    mockRunTarget.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            passed: true,
            reportUnavailable: 'cache replay',
          }),
        },
      ],
    });

    const result = await runTest({
      project: 'shared-components',
      testPathPatterns: 'Foo',
      report: 'summary',
    });

    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(body.failures).toBeUndefined();
    expect(body.numFailedTests).toBeUndefined();
  });
});

describe('runTest multi-word pattern quoting (LS-10153)', () => {
  const MULTI_WORD =
    'createLeagueAndTeams mutation — keeper entitlement gate (LS-8385)';

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunTarget.mockResolvedValue(stubResult());
    mockResolveTestTargetPlan.mockResolvedValue({
      kind: 'single',
      target: 'test',
      shellJoinsArgs: false,
    });
    mockTargetShellJoinsArgs.mockResolvedValue(false);
  });

  function argsOf(): string[] {
    return mockRunTarget.mock.calls[0][0].args as string[];
  }

  it('quotes a multi-word testNamePattern for an nx:run-script target so it stays one argument', async () => {
    mockTargetShellJoinsArgs.mockResolvedValue(true);

    await runTest({
      project: 'db',
      config: 'all-files',
      testPathPatterns: 'leagues.resolver',
      testNamePattern: MULTI_WORD,
    });

    expect(mockTargetShellJoinsArgs).toHaveBeenCalledWith(
      'db',
      'test:all-files',
      '/repo',
    );
    expect(argsOf()).toEqual([
      '--testPathPatterns',
      'leagues.resolver',
      '--testNamePattern',
      `'${MULTI_WORD}'`,
    ]);
  });

  it('leaves no bare word after the flag that Jest could read as an extra path pattern', async () => {
    mockTargetShellJoinsArgs.mockResolvedValue(true);

    await runTest({
      project: 'db',
      config: 'all-files',
      testPathPatterns: 'leagues.resolver',
      testNamePattern: 'keeper entitlement gate',
    });

    // The pre-fix bug: "entitlement" and "gate" survived the shell re-split
    // as positionals and joined the path-pattern set.
    const args = argsOf();
    expect(args).toHaveLength(4);
    expect(args).not.toContain('entitlement');
    expect(args).not.toContain('gate');
  });

  it('quotes a testPathPatterns value containing spaces too', async () => {
    mockTargetShellJoinsArgs.mockResolvedValue(true);

    await runTest({
      project: 'db',
      config: 'all-files',
      testPathPatterns: 'my specs/leagues.resolver',
    });

    expect(argsOf()).toEqual([
      '--testPathPatterns',
      "'my specs/leagues.resolver'",
    ]);
  });

  it('negative control: single-word patterns are unquoted and skip the executor lookup', async () => {
    mockTargetShellJoinsArgs.mockResolvedValue(true);

    await runTest({
      project: 'db',
      config: 'all-files',
      testPathPatterns: 'leagues.resolver',
      testNamePattern: 'keeper',
    });

    // Nothing can be word-split, so the `nx show project` spawn is skipped.
    expect(mockTargetShellJoinsArgs).not.toHaveBeenCalled();
    expect(argsOf()).toEqual([
      '--testPathPatterns',
      'leagues.resolver',
      '--testNamePattern',
      'keeper',
    ]);
  });

  it('negative control: a jest-executor target gets the raw value, quotes would enter the regex', async () => {
    mockTargetShellJoinsArgs.mockResolvedValue(false);

    await runTest({
      project: 'shared-components',
      config: 'web',
      testPathPatterns: 'LeagueListRow',
      testNamePattern: MULTI_WORD,
    });

    expect(argsOf()).toEqual([
      '--testPathPatterns',
      'LeagueListRow',
      '--testNamePattern',
      MULTI_WORD,
    ]);
  });

  it('quotes for a plain "test" target the plan reports as shell-joining', async () => {
    mockResolveTestTargetPlan.mockResolvedValue({
      kind: 'single',
      target: 'test',
      shellJoinsArgs: true,
    });

    await runTest({
      project: 'db',
      testPathPatterns: 'leagues.resolver',
      testNamePattern: MULTI_WORD,
    });

    expect(mockTargetShellJoinsArgs).not.toHaveBeenCalled();
    expect(argsOf()).toEqual([
      '--testPathPatterns',
      'leagues.resolver',
      '--testNamePattern',
      `'${MULTI_WORD}'`,
    ]);
  });

  it('does not quote fanned-out jest targets, which receive argv untouched', async () => {
    mockResolveTestTargetPlan.mockResolvedValue({
      kind: 'fanout',
      targets: ['test:web', 'test:mobile'],
      skipped: [],
    });

    await runTest({
      project: 'shared-components',
      testPathPatterns: 'LeagueListRow',
      testNamePattern: MULTI_WORD,
    });

    for (const call of mockRunTarget.mock.calls) {
      expect(call[0].args).toEqual([
        '--testPathPatterns',
        'LeagueListRow',
        '--testNamePattern',
        MULTI_WORD,
      ]);
    }
  });
});
