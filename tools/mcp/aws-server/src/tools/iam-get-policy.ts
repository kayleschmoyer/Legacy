import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

export interface IamGetPolicyParams {
  policyArn: string;
  listVersions?: boolean;
}

interface PolicyVersion {
  VersionId?: string;
  IsDefaultVersion?: boolean;
  CreateDate?: string;
  Document?: unknown;
}

interface MappedPolicyVersion {
  versionId: string | undefined;
  isDefault: boolean | undefined;
  createDate: string | undefined;
}

interface PolicyMetadata {
  PolicyName?: string;
  PolicyId?: string;
  Arn?: string;
  DefaultVersionId?: string;
  AttachmentCount?: number;
  CreateDate?: string;
  UpdateDate?: string;
}

/**
 * IAM policy ARN allowlist. `runCommand` executes with `shell: true`, so the
 * ARN must be validated before interpolation into `aws iam get-policy
 * --policy-arn <arn>` to prevent shell injection. Matches both AWS-managed
 * (`arn:aws:iam::aws:policy/...`) and customer-managed
 * (`arn:aws:iam::123456789012:policy/...`) ARNs across partitions
 * (aws / aws-cn / aws-us-gov), allowing the legal IAM name/path characters.
 */
const SAFE_POLICY_ARN_RE =
  /^arn:aws(?:-[a-z]+)?:iam::(?:aws|\d{12}):policy\/[A-Za-z0-9+=,.@_/-]+$/;

const SSO_ERROR_PATTERN =
  /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken/i;

function ssoRemedy(): string {
  return 'Run `make kill-stale` to clear stale node processes, then `aws sso login` to re-authenticate, and retry.';
}

export async function iamGetPolicy(
  params: IamGetPolicyParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const { policyArn, listVersions = false } = params;

  if (!SAFE_POLICY_ARN_RE.test(policyArn)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Invalid policyArn "${policyArn}": must be a valid IAM policy ARN (e.g. arn:aws:iam::123456789012:policy/MyPolicy or arn:aws:iam::aws:policy/ReadOnlyAccess).`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Step 1: fetch policy metadata to get the default version ID
  let policyMeta: PolicyMetadata;
  try {
    const metaOut = await runCommand(
      'aws',
      ['iam', 'get-policy', '--policy-arn', policyArn, '--output', 'json'],
      repoRoot,
    );
    const parsed = JSON.parse(metaOut) as { Policy?: PolicyMetadata };
    policyMeta = parsed.Policy ?? {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            policyArn,
            error: message,
            remedy: SSO_ERROR_PATTERN.test(message) ? ssoRemedy() : undefined,
          }),
        },
      ],
      isError: true,
    };
  }

  const defaultVersionId = policyMeta.DefaultVersionId;
  if (!defaultVersionId) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            policyArn,
            error: 'Could not determine DefaultVersionId from policy metadata.',
            policy: policyMeta,
          }),
        },
      ],
      isError: true,
    };
  }

  // Step 2: fetch the default policy version document
  let defaultDocument: unknown;
  try {
    const docOut = await runCommand(
      'aws',
      [
        'iam',
        'get-policy-version',
        '--policy-arn',
        policyArn,
        '--version-id',
        defaultVersionId,
        '--output',
        'json',
      ],
      repoRoot,
    );
    const parsed = JSON.parse(docOut) as {
      PolicyVersion?: PolicyVersion;
    };
    const rawDocument = parsed.PolicyVersion?.Document;
    defaultDocument =
      typeof rawDocument === 'string'
        ? (JSON.parse(decodeURIComponent(rawDocument)) as unknown)
        : (rawDocument ?? null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            policyArn,
            error: `Failed to fetch policy version ${defaultVersionId}: ${message}`,
            remedy: SSO_ERROR_PATTERN.test(message) ? ssoRemedy() : undefined,
          }),
        },
      ],
      isError: true,
    };
  }

  // Step 3 (optional): list all versions
  let versions: MappedPolicyVersion[] | undefined;
  if (listVersions) {
    try {
      const listOut = await runCommand(
        'aws',
        [
          'iam',
          'list-policy-versions',
          '--policy-arn',
          policyArn,
          '--output',
          'json',
        ],
        repoRoot,
      );
      const parsed = JSON.parse(listOut) as { Versions?: PolicyVersion[] };
      versions = (parsed.Versions ?? []).map(
        (v): MappedPolicyVersion => ({
          versionId: v.VersionId,
          isDefault: v.IsDefaultVersion,
          createDate: v.CreateDate,
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              policyArn,
              error: `Failed to list policy versions: ${message}`,
              remedy: SSO_ERROR_PATTERN.test(message) ? ssoRemedy() : undefined,
            }),
          },
        ],
        isError: true,
      };
    }
  }

  const result: Record<string, unknown> = {
    ok: true,
    policyName: policyMeta.PolicyName,
    policyArn: policyMeta.Arn,
    defaultVersionId,
    attachmentCount: policyMeta.AttachmentCount,
    createDate: policyMeta.CreateDate,
    updateDate: policyMeta.UpdateDate,
    document: defaultDocument,
  };
  if (versions !== undefined) {
    result.versions = versions;
  }

  // Single object with a nested policy `document` -> minified JSON.
  return {
    content: [{ type: 'text', text: minifiedJson(result) }],
  };
}
