import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';
import { errorResult } from '../aws-error.js';

// Input validation patterns
const SAFE_NAME_FILTER_RE = /^[A-Za-z0-9._*-]+$/;
const SAFE_VPC_ID_RE = /^vpc-[0-9a-f]{8,17}$/;
const SAFE_GROUP_ID_RE = /^sg-[0-9a-f]{8,17}$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IpRange {
  CidrIp?: string;
  Description?: string;
}

interface Ipv6Range {
  CidrIpv6?: string;
  Description?: string;
}

interface UserIdGroupPair {
  GroupId?: string;
  GroupName?: string;
  UserId?: string;
  Description?: string;
}

interface IpPermission {
  IpProtocol?: string;
  FromPort?: number;
  ToPort?: number;
  IpRanges?: IpRange[];
  Ipv6Ranges?: Ipv6Range[];
  UserIdGroupPairs?: UserIdGroupPair[];
}

interface SecurityGroup {
  GroupId?: string;
  GroupName?: string;
  Description?: string;
  VpcId?: string;
  OwnerId?: string;
  IpPermissions?: IpPermission[];
  IpPermissionsEgress?: IpPermission[];
  Tags?: Array<{ Key?: string; Value?: string }>;
}

interface DescribeSecurityGroupsResponse {
  SecurityGroups?: SecurityGroup[];
}

// ---------------------------------------------------------------------------
// aws_ec2_describe_security_groups
// ---------------------------------------------------------------------------

export interface DescribeSecurityGroupsParams {
  groupIds?: string[];
  environment?: string;
  nameFilter?: string;
  vpcId?: string;
}

function formatPermission(p: IpPermission) {
  const protocol = p.IpProtocol === '-1' ? 'all' : (p.IpProtocol ?? 'unknown');
  const portRange =
    p.FromPort !== undefined && p.ToPort !== undefined
      ? p.FromPort === p.ToPort
        ? String(p.FromPort)
        : `${p.FromPort}-${p.ToPort}`
      : null;
  return {
    protocol,
    portRange,
    ipv4Ranges: (p.IpRanges ?? []).map((r) => ({
      cidr: r.CidrIp ?? null,
      description: r.Description ?? null,
    })),
    ipv6Ranges: (p.Ipv6Ranges ?? []).map((r) => ({
      cidr: r.CidrIpv6 ?? null,
      description: r.Description ?? null,
    })),
    securityGroups: (p.UserIdGroupPairs ?? []).map((g) => ({
      groupId: g.GroupId ?? null,
      groupName: g.GroupName ?? null,
      description: g.Description ?? null,
    })),
  };
}

export async function describeSecurityGroups(
  params: DescribeSecurityGroupsParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const { groupIds, environment = 'dev', nameFilter, vpcId } = params;

  if (groupIds !== undefined) {
    if (groupIds.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error:
                'groupIds must contain at least one security group ID when provided.',
            }),
          },
        ],
        isError: true,
      };
    }
    // Mutual-exclusion check — groupIds cannot be combined with nameFilter/vpcId
    // since AWS CLI does not support mixing --group-ids with --filters for security groups.
    const conflictingFields: string[] = [];
    if (nameFilter !== undefined) conflictingFields.push('nameFilter');
    if (vpcId !== undefined) conflictingFields.push('vpcId');
    if (conflictingFields.length > 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: `Cannot combine groupIds with filter fields: ${conflictingFields.join(', ')}. Use groupIds alone or omit it and filter by nameFilter/vpcId.`,
            }),
          },
        ],
        isError: true,
      };
    }

    // Validate each group ID format before passing to AWS CLI.
    for (const id of groupIds) {
      if (!SAFE_GROUP_ID_RE.test(id)) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                error: `Invalid groupId "${id}": must match sg-[0-9a-f]{8,17}.`,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  } else {
    // Validate environment value before interpolating into AWS CLI --filters argument.
    // (Only validated here because environment is ignored when groupIds is provided.)
    if (environment !== 'dev' && environment !== 'prod') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: `Invalid environment "${environment}": must be 'dev' or 'prod'.`,
            }),
          },
        ],
        isError: true,
      };
    }
    // Validate nameFilter and vpcId before interpolating into CLI args.
    if (nameFilter !== undefined && !SAFE_NAME_FILTER_RE.test(nameFilter)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error:
                'Invalid nameFilter: only alphanumeric characters, dots, underscores, hyphens, and wildcards (*) are allowed.',
            }),
          },
        ],
        isError: true,
      };
    }
    if (vpcId !== undefined && !SAFE_VPC_ID_RE.test(vpcId)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: `Invalid vpcId "${vpcId}": must match vpc-[0-9a-f]{8,17}.`,
            }),
          },
        ],
        isError: true,
      };
    }
  }

  const args = ['ec2', 'describe-security-groups', '--output', 'json'];

  if (groupIds !== undefined && groupIds.length > 0) {
    args.push('--group-ids', ...groupIds);
  } else {
    const filters: string[] = [];
    if (environment) filters.push(`Name=tag:Environment,Values=${environment}`);
    if (nameFilter) filters.push(`Name=group-name,Values=*${nameFilter}*`);
    if (vpcId) filters.push(`Name=vpc-id,Values=${vpcId}`);
    for (const f of filters) args.push('--filters', f);
  }

  try {
    const output = await runCommand('aws', args, repoRoot);
    const data = JSON.parse(output) as DescribeSecurityGroupsResponse;
    const groups = (data.SecurityGroups ?? []).map((sg) => ({
      groupId: sg.GroupId,
      groupName: sg.GroupName,
      description: sg.Description ?? null,
      vpcId: sg.VpcId ?? null,
      tags: Object.fromEntries(
        (sg.Tags ?? [])
          .filter((t) => t.Key !== undefined)
          .map((t) => [t.Key!, t.Value ?? '']),
      ),
      inboundRules: (sg.IpPermissions ?? []).map(formatPermission),
      outboundRules: (sg.IpPermissionsEgress ?? []).map(formatPermission),
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { count: groups.length, securityGroups: groups },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult('Failed to describe security groups', message);
  }
}
