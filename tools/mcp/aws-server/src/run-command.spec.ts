import { describe, expect, it } from '@jest/globals';

import { runCommand } from './run-command.js';

describe('runCommand', () => {
  it('passes a JSON argument through byte-for-byte, without shell re-parsing', async () => {
    // Regression test for LS-8923: with `shell: true`, Node joins `command`
    // and `args` into one string and hands it to the platform shell, which
    // strips unescaped quotes/braces from an arg like `{"commands":["df -h /"]}`
    // before the process ever sees it — exactly the `aws ssm send-command
    // --parameters` failure reported on the ticket. `node -p` prints its
    // argv back out, so this asserts the JSON survives intact end to end.
    const parametersJson = JSON.stringify({ commands: ['df -h /'] });

    const output = await runCommand(
      'node',
      ['-e', 'process.stdout.write(process.argv[1])', parametersJson],
      process.cwd(),
    );

    expect(output).toBe(parametersJson);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('resolves with the partial output instead of rejecting when stdout exceeds maxBuffer', async () => {
    // Regression for LS-5211: Node's default execFile maxBuffer error hands
    // back the buffered stdout as the *error message*, which upstream tools
    // then wrap verbatim as `{ ok: false, error: <huge dump> }`. Resolving
    // instead lets callers apply their own truncation/size caps.
    const output = await runCommand(
      'node',
      ['-e', 'process.stdout.write("a".repeat(2000))'],
      process.cwd(),
      {},
      undefined,
      1000,
    );

    expect(output.length).toBe(1000);
  });

  it('rewrites a spawn ENOENT into an actionable message naming the missing binary (LS-9537)', async () => {
    // Regression for LS-9537: Claude Code Remote sessions don't have the AWS
    // CLI on PATH, so every aws_* tool previously surfaced the raw, cryptic
    // `spawn aws ENOENT` instead of an explanation. A nonexistent binary name
    // reproduces the same `err.code === 'ENOENT'` Node reports for `aws`.
    await expect(
      runCommand('definitely-not-a-real-binary', [], process.cwd()),
    ).rejects.toThrow(
      /definitely-not-a-real-binary CLI not found \(spawn definitely-not-a-real-binary ENOENT\).*Claude Code Remote/s,
    );
  });
});
