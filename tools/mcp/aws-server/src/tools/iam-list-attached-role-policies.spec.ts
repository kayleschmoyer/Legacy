jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import { runCommand } from '../run-command.js';
import { iamListAttachedRolePolicies } from './iam-list-attached-role-policies.js';

const mockedRun = runCommand as jest.MockedFunction<typeof runCommand>;

function body(
  result: Awaited<ReturnType<typeof iamListAttachedRolePolicies>>,
): {
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

describe('iamListAttachedRolePolicies roleName validation', () => {
  it('rejects a roleName containing shell metacharacters without invoking the CLI', async () => {
    const { text, isError } = body(
      await iamListAttachedRolePolicies({
        roleName: 'MyRole; rm -rf /',
      }),
    );
    expect(isError).toBe(true);
    expect(text.ok).toBe(false);
    expect(String(text.error)).toMatch(/Invalid roleName/);
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it('returns mapped attached policies for a well-formed role name', async () => {
    mockedRun.mockResolvedValue(
      JSON.stringify({
        AttachedPolicies: [
          {
            PolicyName: 'ReadOnlyAccess',
            PolicyArn: 'arn:aws:iam::aws:policy/ReadOnlyAccess',
          },
        ],
      }),
    );

    const { text, isError } = body(
      await iamListAttachedRolePolicies({ roleName: 'MyRole' }),
    );
    expect(isError).toBe(false);
    expect(text.ok).toBe(true);
    expect(text.roleName).toBe('MyRole');
    expect(text.policies).toEqual([
      {
        policyName: 'ReadOnlyAccess',
        policyArn: 'arn:aws:iam::aws:policy/ReadOnlyAccess',
      },
    ]);
    expect(mockedRun).toHaveBeenCalledWith(
      'aws',
      [
        'iam',
        'list-attached-role-policies',
        '--role-name',
        'MyRole',
        '--output',
        'json',
      ],
      '/repo',
    );
  });

  it('follows NextToken to collect all pages of attached policies', async () => {
    mockedRun
      .mockResolvedValueOnce(
        JSON.stringify({
          AttachedPolicies: [
            {
              PolicyName: 'PageOnePolicy',
              PolicyArn: 'arn:aws:iam::aws:policy/PageOnePolicy',
            },
          ],
          NextToken: 'token-1',
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          AttachedPolicies: [
            {
              PolicyName: 'PageTwoPolicy',
              PolicyArn: 'arn:aws:iam::aws:policy/PageTwoPolicy',
            },
          ],
        }),
      );

    const { text, isError } = body(
      await iamListAttachedRolePolicies({ roleName: 'MyRole' }),
    );
    expect(isError).toBe(false);
    expect(text.policies).toEqual([
      {
        policyName: 'PageOnePolicy',
        policyArn: 'arn:aws:iam::aws:policy/PageOnePolicy',
      },
      {
        policyName: 'PageTwoPolicy',
        policyArn: 'arn:aws:iam::aws:policy/PageTwoPolicy',
      },
    ]);
    expect(mockedRun).toHaveBeenCalledTimes(2);
    expect(mockedRun).toHaveBeenNthCalledWith(
      2,
      'aws',
      [
        'iam',
        'list-attached-role-policies',
        '--role-name',
        'MyRole',
        '--output',
        'json',
        '--starting-token',
        'token-1',
      ],
      '/repo',
    );
  });

  it('surfaces SSO expiry errors with a remedy', async () => {
    mockedRun.mockRejectedValue(new Error('The SSO session has expired'));

    const { text, isError } = body(
      await iamListAttachedRolePolicies({ roleName: 'MyRole' }),
    );
    expect(isError).toBe(true);
    expect(text.ok).toBe(false);
    expect(String(text.remedy)).toMatch(/aws sso login/);
  });
});
