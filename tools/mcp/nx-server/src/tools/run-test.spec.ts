import { describe, expect, it, jest } from '@jest/globals';

jest.mock('./run-target.js', () => ({ runTarget: jest.fn() }));
jest.mock('./resolve-test-target.js', () => ({
  resolveTestTargetPlan: jest.fn(),
}));
jest.mock('../run-command.js', () => ({ getRepoRoot: jest.fn(() => '/repo') }));

import { runTest } from './run-test.js';
import { runTarget } from './run-target.js';
import { resolveTestTargetPlan } from './resolve-test-target.js';
import type { ToolResult } from '../types.js';

const mockRunTarget = runTarget as jest.MockedFunction<typeof runTarget>;
const mockResolveTestTargetPlan = resolveTestTargetPlan as jest.MockedFunction<
  typeof resolveTestTargetPlan
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
    });
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

describe('runTest testPathPatterns validation (ReDoS mitigation)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunTarget.mockResolvedValue(stubResult());
    mockResolveTestTargetPlan.mockResolvedValue({
      kind: 'single',
      target: 'test',
    });
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
