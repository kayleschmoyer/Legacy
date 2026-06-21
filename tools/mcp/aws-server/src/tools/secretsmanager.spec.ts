jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import { runCommand } from '../run-command.js';
import { describeSecret, listSecrets } from './secretsmanager.js';

const mockedRun = runCommand as jest.MockedFunction<typeof runCommand>;

function text(result: Awaited<ReturnType<typeof listSecrets>>): string {
  const block = result.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Expected a text content block');
  }
  return block.text;
}

beforeEach(() => {
  mockedRun.mockReset();
});

describe('listSecrets', () => {
  it('renders a Markdown table (headers once, not pretty JSON)', async () => {
    mockedRun.mockResolvedValue(
      JSON.stringify({
        SecretList: [
          {
            Name: 'dev/mlb-data-api-key',
            ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:dev/mlb-data-api-key-AbCdEf',
            Description: 'MLB data feed key',
            LastChangedDate: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );

    const out = text(await listSecrets({ environment: 'dev' }));
    const lines = out.split('\n');
    expect(lines[0]).toBe('name|arn|description|lastChangedDate');
    expect(lines[1]).toBe('---|---|---|---');
    expect(lines[2]).toContain('dev/mlb-data-api-key');
    expect(out).not.toContain('\n  "');
  });

  it('returns an explicit empty signal when no secrets match', async () => {
    mockedRun.mockResolvedValue(JSON.stringify({ SecretList: [] }));
    const out = text(await listSecrets({ environment: 'dev' }));
    expect(out).toBe('No secrets found.');
  });
});

describe('describeSecret', () => {
  it('returns minified JSON (no pretty-print indentation)', async () => {
    mockedRun.mockResolvedValue(
      JSON.stringify({
        ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:dev/x-AbCdEf',
        Name: 'dev/x',
        Description: 'a secret',
        RotationEnabled: false,
        LastChangedDate: '2026-01-01T00:00:00.000Z',
        Tags: [{ Key: 'env', Value: 'dev' }],
        VersionIdsToStages: { v1: ['AWSCURRENT'] },
      }),
    );

    const out = text(
      await describeSecret({ secretId: 'x', environment: 'dev' }),
    );
    expect(out).not.toContain('\n');
    const parsed = JSON.parse(out) as { ok: boolean; versionCount: number };
    expect(parsed.ok).toBe(true);
    expect(parsed.versionCount).toBe(1);
  });
});
