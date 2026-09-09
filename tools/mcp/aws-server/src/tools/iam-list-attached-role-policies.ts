import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

export interface IamListAttachedRolePoliciesParams {
  roleName: string;
}

interface AttachedPolicy {
  PolicyName?: string;
  PolicyArn?: string;
}

interface MappedAttachedPolicy {
  policyName: string | undefined;
  policyArn: string | undefined;
}

/**
 * IAM role name allowlist, matching AWS's own constraints (up to 64 chars,
 * `[\w+=,.@-]+`). Defensive validation before interpolating into `aws iam
 * list-attached-role-policies --role-name <roleName>`.
 */
const SAFE_ROLE_NAME_RE = /^[A-Za-z0-9+=,.@_-]{1,64}$/;

const SSO_ERROR_PATTERN =
  /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken/i;

function ssoRemedy(): string {
  return 'Run `make kill-stale` to clear stale node processes, then `aws sso login` to re-authenticate, and retry.';
}

export async function iamListAttachedRolePolicies(
  params: IamListAttachedRolePoliciesParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const { roleName } = params;

  if (!SAFE_ROLE_NAME_RE.test(roleName)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Invalid roleName "${roleName}": must be a valid IAM role name (up to 64 chars, letters/digits/+=,.@_-).`,
          }),
        },
      ],
      isError: true,
    };
  }

  let attachedPolicies: AttachedPolicy[];
  try {
    attachedPolicies = [];
    let nextToken: string | undefined;
    do {
      const args = [
        'iam',
        'list-attached-role-policies',
        '--role-name',
        roleName,
        '--output',
        'json',
      ];
      if (nextToken) {
        args.push('--starting-token', nextToken);
      }
      const out = await runCommand('aws', args, repoRoot);
      const parsed = JSON.parse(out) as {
        AttachedPolicies?: AttachedPolicy[];
        NextToken?: string;
      };
      attachedPolicies.push(...(parsed.AttachedPolicies ?? []));
      nextToken = parsed.NextToken;
    } while (nextToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            roleName,
            error: message,
            remedy: SSO_ERROR_PATTERN.test(message) ? ssoRemedy() : undefined,
          }),
        },
      ],
      isError: true,
    };
  }

  const policies: MappedAttachedPolicy[] = attachedPolicies.map(
    (p): MappedAttachedPolicy => ({
      policyName: p.PolicyName,
      policyArn: p.PolicyArn,
    }),
  );

  const result = {
    ok: true,
    roleName,
    policies,
  };

  return {
    content: [{ type: 'text', text: minifiedJson(result) }],
  };
}
