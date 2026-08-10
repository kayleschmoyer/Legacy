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
});
