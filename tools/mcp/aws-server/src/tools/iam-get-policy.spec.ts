jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import { iamGetPolicy } from './iam-get-policy.js';
import { runCommand } from '../run-command.js';

const mockedRun = runCommand as jest.MockedFunction<typeof runCommand>;

function body(result: Awaited<ReturnType<typeof iamGetPolicy>>): {
  text: Record<string, unknown>;
  isError: boolean;
} {
  const block = result.content[0];
  if (!block || block.type !== 'text') throw new Error('expected text block');
  return {
    text: JSON.parse(block.text) as Record<string, unknown>,
    isError: Boolean(result.isError),
  };
}

beforeEach(() => mockedRun.mockReset());

describe('iamGetPolicy policyArn validation', () => {
  it('rejects a policyArn containing shell metacharacters without invoking the CLI', async () => {
    const { text, isError } = body(
      await iamGetPolicy({
        policyArn: 'arn:aws:iam::123456789012:policy/X; rm -rf /',
      }),
    );
    expect(isError).toBe(true);
    expect(text.ok).toBe(false);
    expect(String(text.error)).toMatch(/Invalid policyArn/);
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it('accepts a well-formed customer-managed policy ARN', async () => {
    mockedRun.mockImplementation((_cmd, args) => {
      if (args.includes('get-policy-version')) {
        return Promise.resolve(
          JSON.stringify({
            PolicyVersion: { Document: { Version: '2012-10-17' } },
          }),
        );
      }
      return Promise.resolve(
        JSON.stringify({
          Policy: {
            PolicyName: 'MyPolicy',
            Arn: 'arn:aws:iam::123456789012:policy/MyPolicy',
            DefaultVersionId: 'v1',
          },
        }),
      );
    });

    const { text, isError } = body(
      await iamGetPolicy({
        policyArn: 'arn:aws:iam::123456789012:policy/MyPolicy',
      }),
    );
    expect(isError).toBe(false);
    expect(text.ok).toBe(true);
    expect(text.policyName).toBe('MyPolicy');
  });
});
