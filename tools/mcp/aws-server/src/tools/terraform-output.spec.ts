jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import { runCommand } from '../run-command.js';
import { terraformOutput } from './terraform-output.js';

const mockedRun = runCommand as jest.MockedFunction<typeof runCommand>;

function body(result: Awaited<ReturnType<typeof terraformOutput>>): {
  text: string;
  parsed: Record<string, unknown>;
  isError: boolean;
} {
  const block = result.content[0];
  if (!block || block.type !== 'text') throw new Error('expected text block');
  return {
    text: block.text,
    parsed: JSON.parse(block.text) as Record<string, unknown>,
    isError: Boolean(result.isError),
  };
}

beforeEach(() => mockedRun.mockReset());

describe('terraformOutput key validation', () => {
  it('rejects an output name with shell metacharacters without invoking the CLI', async () => {
    const { parsed, isError } = body(
      await terraformOutput({ keys: ['vpc_id; rm -rf /'] }),
    );
    expect(isError).toBe(true);
    expect(parsed.ok).toBe(false);
    expect(String(parsed.error)).toMatch(/Invalid output name/);
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it('returns a minified bare outputs map for valid keys', async () => {
    mockedRun.mockResolvedValue(
      JSON.stringify({
        vpc_id: { value: 'vpc-123', type: 'string' },
        rds_endpoint: { value: 'db.example.com', type: 'string' },
      }),
    );
    const { text, parsed, isError } = body(
      await terraformOutput({ keys: ['vpc_id'] }),
    );
    expect(isError).toBe(false);
    expect(text).not.toContain('\n');
    expect(parsed).toEqual({ vpc_id: 'vpc-123' });
  });
});
