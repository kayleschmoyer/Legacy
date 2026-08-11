import { describe, expect, it, jest } from '@jest/globals';

jest.mock('./run-target.js', () => ({ runTarget: jest.fn() }));

import { runTest } from './run-test.js';
import { runTarget } from './run-target.js';
import type { ToolResult } from '../types.js';

const mockRunTarget = runTarget as jest.MockedFunction<typeof runTarget>;

function stubResult(): ToolResult {
  return { content: [{ type: 'text', text: '{}' }] };
}

describe('runTest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunTarget.mockResolvedValue(stubResult());
  });

  it('maps config to a colon-suffixed target', async () => {
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
  });

  it('falls back to the bare "test" target when config is omitted', async () => {
    await runTest({ project: 'db', testPathPatterns: 'delete-resilience' });

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

  it('passes through the runTarget result unchanged', async () => {
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
});

describe('runTest testPathPatterns validation (ReDoS mitigation)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunTarget.mockResolvedValue(stubResult());
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
});
