jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import { runCommand } from '../run-command.js';
import { ssmRunCommand } from './ssm-run-command.js';

const mockedRun = runCommand as jest.MockedFunction<typeof runCommand>;

function body(result: Awaited<ReturnType<typeof ssmRunCommand>>): {
  parsed: Record<string, unknown>;
  isError: boolean;
} {
  const block = result.content[0];
  if (!block || block.type !== 'text') throw new Error('expected text block');
  return {
    parsed: JSON.parse(block.text) as Record<string, unknown>,
    isError: Boolean(result.isError),
  };
}

beforeEach(() => mockedRun.mockReset());

const VALID_INSTANCE = 'i-0abc1234def567890';

describe('ssmRunCommand injection guard', () => {
  it('rejects a command with shell metacharacters before invoking send-command', async () => {
    const { parsed, isError } = body(
      await ssmRunCommand({
        instanceId: VALID_INSTANCE,
        commands: ['ls -la; rm -rf /'],
      }),
    );
    expect(isError).toBe(true);
    expect(parsed.ok).toBe(false);
    expect(String(parsed.error)).toMatch(/disallowed characters/);
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it('rejects an invalid instanceId without invoking the CLI', async () => {
    const { isError } = body(
      await ssmRunCommand({ instanceId: 'i-bad', commands: ['ls'] }),
    );
    expect(isError).toBe(true);
    expect(mockedRun).not.toHaveBeenCalled();
  });
});
