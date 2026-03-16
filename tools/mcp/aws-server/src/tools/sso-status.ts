import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface CallerIdentity {
  UserId: string;
  Account: string;
  Arn: string;
}

export async function ssoStatus(): Promise<ToolResult> {
  const repoRoot = getRepoRoot();

  try {
    const output = await runCommand(
      'aws',
      ['sts', 'get-caller-identity', '--output', 'json'],
      repoRoot,
    );

    const identity = JSON.parse(output) as CallerIdentity;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            authenticated: true,
            userId: identity.UserId,
            account: identity.Account,
            arn: identity.Arn,
          }),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isSsoError =
      /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken|not authorized|UnauthorizedAccess/i.test(
        message,
      );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            authenticated: false,
            error: isSsoError
              ? 'AWS SSO session has expired or credentials are missing.'
              : message,
            remedy: 'Run `aws sso login` to authenticate, then retry.',
          }),
        },
      ],
      isError: true,
    };
  }
}
