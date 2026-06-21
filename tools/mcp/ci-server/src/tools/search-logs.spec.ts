import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../logs.js', () => ({
  fetchRunLogs: jest.fn(),
}));

import { searchLogs } from './search-logs.js';
import { fetchRunLogs } from '../logs.js';

const mockFetchRunLogs = fetchRunLogs as jest.MockedFunction<
  typeof fetchRunLogs
>;

function textOf(result: { content: Array<{ text?: string }> }): string {
  return result.content[0]?.text ?? '';
}

describe('searchLogs ReDoS guard', () => {
  beforeEach(() => {
    mockFetchRunLogs.mockReset();
  });

  it('rejects a nested-quantifier pattern without fetching logs', async () => {
    const result = await searchLogs({
      runId: 1,
      pattern: '(a+)+',
      isRegex: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Unsafe regex pattern.*nested quantifiers/);
    expect(mockFetchRunLogs).not.toHaveBeenCalled();
  });

  it('rejects an over-long pattern without fetching logs', async () => {
    const result = await searchLogs({
      runId: 1,
      pattern: 'a'.repeat(1001),
      isRegex: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Unsafe regex pattern.*too long/);
    expect(mockFetchRunLogs).not.toHaveBeenCalled();
  });

  it('surfaces a clear error for an invalid (uncompilable) regex', async () => {
    const result = await searchLogs({
      runId: 1,
      pattern: '(unbalanced',
      isRegex: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Invalid regex pattern/);
    expect(mockFetchRunLogs).not.toHaveBeenCalled();
  });

  it('does not apply the regex guard to literal substring search', async () => {
    mockFetchRunLogs.mockResolvedValue('line one\n(a+)+ literal\nline three');
    const result = await searchLogs({
      runId: 1,
      pattern: '(a+)+', // would be rejected as a regex, but here it is literal
      isRegex: false,
    });
    expect(result.isError).toBeUndefined();
    expect(mockFetchRunLogs).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(textOf(result));
    expect(parsed.returnedMatches).toBe(1);
  });

  it('allows a safe regex and returns matches', async () => {
    mockFetchRunLogs.mockResolvedValue('INFO ok\nERROR boom\nINFO done');
    const result = await searchLogs({
      runId: 1,
      pattern: '^ERROR',
      isRegex: true,
    });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(textOf(result));
    expect(parsed.returnedMatches).toBe(1);
    expect(parsed.matches[0].line).toBe('ERROR boom');
  });
});
