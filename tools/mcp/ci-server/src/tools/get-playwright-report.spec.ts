import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../playwright-report.js', () => ({
  fetchPlaywrightReport: jest.fn(),
  fullTitle: jest.fn((test: { path?: string[]; title: string }) =>
    [...(test.path ?? []), test.title].join(' > '),
  ),
  reportUrlFor: jest.fn((name: string) => `https://example.com/${name}/`),
}));

import { getPlaywrightReport } from './get-playwright-report.js';
import * as playwrightReport from '../playwright-report.js';

const mockFetch = playwrightReport.fetchPlaywrightReport as jest.MockedFunction<
  typeof playwrightReport.fetchPlaywrightReport
>;

const BASE_STATS = {
  total: 3,
  expected: 1,
  unexpected: 0,
  flaky: 0,
  skipped: 2,
  ok: true,
};

describe('getPlaywrightReport — skippedTests', () => {
  it('includes name, file, and reason from a skip annotation', async () => {
    mockFetch.mockResolvedValue({
      stats: BASE_STATS,
      files: [
        {
          fileName: 'auth-flows.spec.ts',
          tests: [
            {
              title: 'clears JWT and re-authenticates',
              path: ['Logout Flow'],
              outcome: 'skipped',
              annotations: [
                {
                  type: 'skip',
                  description:
                    'WebKit blocks localStorage access — SecurityError',
                },
              ],
            },
          ],
        },
      ],
    });

    const result = await getPlaywrightReport({ reportName: 'pr-1' });
    const payload = JSON.parse(result.content[0].text) as {
      skippedTests: Array<{
        name: string;
        file: string;
        reason: string | null;
      }>;
    };

    expect(payload.skippedTests).toHaveLength(1);
    expect(payload.skippedTests[0]).toEqual({
      name: 'Logout Flow > clears JWT and re-authenticates',
      file: 'auth-flows.spec.ts',
      reason: 'WebKit blocks localStorage access — SecurityError',
    });
  });

  it('includes reason from a fixme annotation', async () => {
    mockFetch.mockResolvedValue({
      stats: { ...BASE_STATS, skipped: 1, expected: 2 },
      files: [
        {
          fileName: 'subscription.spec.ts',
          tests: [
            {
              title: 'free user sees blurred content',
              path: ['PremiumGate'],
              outcome: 'skipped',
              annotations: [
                {
                  type: 'fixme',
                  description: 'Flaky — blur overlay timing issue',
                },
              ],
            },
          ],
        },
      ],
    });

    const result = await getPlaywrightReport({ reportName: 'pr-1' });
    const payload = JSON.parse(result.content[0].text) as {
      skippedTests: Array<{
        name: string;
        file: string;
        reason: string | null;
      }>;
    };

    expect(payload.skippedTests[0].reason).toBe(
      'Flaky — blur overlay timing issue',
    );
  });

  it('sets reason to null when annotations array is absent', async () => {
    mockFetch.mockResolvedValue({
      stats: { ...BASE_STATS, skipped: 1, expected: 2 },
      files: [
        {
          fileName: 'some.spec.ts',
          tests: [
            {
              title: 'a skipped test',
              outcome: 'skipped',
            },
          ],
        },
      ],
    });

    const result = await getPlaywrightReport({ reportName: 'pr-1' });
    const payload = JSON.parse(result.content[0].text) as {
      skippedTests: Array<{ reason: string | null }>;
    };

    expect(payload.skippedTests[0].reason).toBeNull();
  });

  it('sets reason to null when annotation has no description', async () => {
    mockFetch.mockResolvedValue({
      stats: { ...BASE_STATS, skipped: 1, expected: 2 },
      files: [
        {
          fileName: 'some.spec.ts',
          tests: [
            {
              title: 'a skipped test',
              outcome: 'skipped',
              annotations: [{ type: 'skip' }],
            },
          ],
        },
      ],
    });

    const result = await getPlaywrightReport({ reportName: 'pr-1' });
    const payload = JSON.parse(result.content[0].text) as {
      skippedTests: Array<{ reason: string | null }>;
    };

    expect(payload.skippedTests[0].reason).toBeNull();
  });
});
