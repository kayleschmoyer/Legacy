jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import { ssmRunCommand } from './ssm-run-command.js';
import { runCommand } from '../run-command.js';

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

describe('ssmRunCommand bounded wait', () => {
  it('returns the terminal result when the command finishes within the budget', async () => {
    mockedRun
      .mockResolvedValueOnce(
        JSON.stringify({ Command: { CommandId: 'cmd-123' } }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          Status: 'Success',
          StandardOutputContent: 'hello\n',
          StandardErrorContent: '',
          ResponseCode: 0,
        }),
      );

    const { parsed, isError } = body(
      await ssmRunCommand({
        instanceId: VALID_INSTANCE,
        commands: ['ls -la'],
      }),
    );
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe('Success');
    expect(parsed.stdout).toBe('hello');
  });

  it('returns an in-progress snapshot with a re-arm hint instead of blocking past the cap', async () => {
    mockedRun
      .mockResolvedValueOnce(
        JSON.stringify({ Command: { CommandId: 'cmd-123' } }),
      )
      .mockResolvedValue(JSON.stringify({ Status: 'InProgress' }));

    const { parsed, isError } = body(
      await ssmRunCommand({
        instanceId: VALID_INSTANCE,
        commands: ['sleep-adjacent-workload'],
        maxWaitSeconds: 5,
      }),
    );
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe('InProgress');
    expect(parsed.commandId).toBe('cmd-123');
    expect(String(parsed.hint)).toMatch(/commandId: "cmd-123"/);
  });

  it('re-arms with commandId: polls only, never re-sends the command', async () => {
    mockedRun.mockResolvedValueOnce(
      JSON.stringify({
        Status: 'Success',
        StandardOutputContent: 'done\n',
        ResponseCode: 0,
      }),
    );

    const { parsed, isError } = body(
      await ssmRunCommand({
        instanceId: VALID_INSTANCE,
        commandId: 'cmd-123',
      }),
    );
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(parsed.stdout).toBe('done');
    expect(mockedRun).toHaveBeenCalledTimes(1);
    const firstArgs = mockedRun.mock.calls[0]?.[1] ?? [];
    expect(firstArgs).toContain('get-command-invocation');
    expect(firstArgs).not.toContain('send-command');
  });
});
