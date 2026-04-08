import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

const SSO_ERROR_PATTERN =
  /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken/i;

function ssoRemedy(): string {
  return 'Run `aws sso login` to re-authenticate, then retry.';
}

function errorResult(context: string, message: string): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ok: false,
          error: `${context}: ${message}`,
          remedy: SSO_ERROR_PATTERN.test(message) ? ssoRemedy() : undefined,
        }),
      },
    ],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// aws_ec2_instances
// ---------------------------------------------------------------------------

export interface Ec2InstancesParams {
  environment?: string;
  state?: string;
  nameFilter?: string;
}

interface Ec2Tag {
  Key?: string;
  Value?: string;
}

interface Ec2Instance {
  InstanceId?: string;
  InstanceType?: string;
  State?: { Name?: string };
  PublicIpAddress?: string;
  PrivateIpAddress?: string;
  LaunchTime?: string;
  Tags?: Ec2Tag[];
  Architecture?: string;
  ImageId?: string;
  KeyName?: string;
}

interface Ec2Reservation {
  Instances?: Ec2Instance[];
}

interface Ec2DescribeResponse {
  Reservations?: Ec2Reservation[];
}

function getTag(tags: Ec2Tag[] | undefined, key: string): string | undefined {
  return tags?.find((t) => t.Key === key)?.Value;
}

const SAFE_NAME_FILTER_RE = /^[A-Za-z0-9._*-]+$/;

export async function ec2Instances(
  params: Ec2InstancesParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const { environment = 'dev', state, nameFilter } = params;

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

  const filters: string[] = [`Name=tag:Environment,Values=${environment}`];
  if (state) filters.push(`Name=instance-state-name,Values=${state}`);
  if (nameFilter) filters.push(`Name=tag:Name,Values=*${nameFilter}*`);

  const args = [
    'ec2',
    'describe-instances',
    '--output',
    'json',
    ...filters.flatMap((f) => ['--filters', f]),
  ];

  try {
    const output = await runCommand('aws', args, repoRoot);
    const data = JSON.parse(output) as Ec2DescribeResponse;

    const instances = (data.Reservations ?? []).flatMap(
      (r) => r.Instances ?? [],
    );

    const formatted = instances.map((i) => ({
      instanceId: i.InstanceId,
      instanceType: i.InstanceType,
      state: i.State?.Name,
      name: getTag(i.Tags, 'Name'),
      publicIp: i.PublicIpAddress ?? null,
      privateIp: i.PrivateIpAddress ?? null,
      launchTime: i.LaunchTime,
      imageId: i.ImageId,
      keyName: i.KeyName ?? null,
      architecture: i.Architecture,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { count: formatted.length, instances: formatted },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult('Failed to describe EC2 instances', message);
  }
}

// ---------------------------------------------------------------------------
// aws_ec2_console_output
// ---------------------------------------------------------------------------

export interface Ec2ConsoleOutputParams {
  instanceId: string;
  latest?: boolean;
}

interface ConsoleOutputResponse {
  InstanceId?: string;
  Timestamp?: string;
  Output?: string;
}

const INSTANCE_ID_RE = /^i-[0-9a-f]{17}$/;

export async function ec2ConsoleOutput(
  params: Ec2ConsoleOutputParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const { instanceId, latest = true } = params;

  if (!INSTANCE_ID_RE.test(instanceId)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Invalid instanceId "${instanceId}": must match i-[0-9a-f]{17}.`,
          }),
        },
      ],
      isError: true,
    };
  }

  const args = [
    'ec2',
    'get-console-output',
    '--instance-id',
    instanceId,
    '--output',
    'json',
    ...(latest ? ['--latest'] : []),
  ];

  try {
    const output = await runCommand('aws', args, repoRoot);
    const data = JSON.parse(output) as ConsoleOutputResponse;

    // AWS returns the output base64-encoded
    const rawOutput = data.Output
      ? Buffer.from(data.Output, 'base64').toString('utf-8')
      : null;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              instanceId: data.InstanceId,
              timestamp: data.Timestamp ?? null,
              output: rawOutput ?? '(no console output available)',
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(
      `Failed to get console output for ${instanceId}`,
      message,
    );
  }
}

// ---------------------------------------------------------------------------

// aws_ec2_launch_template_inspect
// ---------------------------------------------------------------------------

export interface LaunchTemplateInspectParams {
  environment?: string;
  name?: string;
}

interface LaunchTemplate {
  LaunchTemplateId?: string;
  LaunchTemplateName?: string;
  LatestVersionNumber?: number;
  Tags?: Ec2Tag[];
}

interface DescribeLaunchTemplatesResponse {
  LaunchTemplates?: LaunchTemplate[];
}

interface IamInstanceProfileSpec {
  Arn?: string;
  Name?: string;
}

interface LaunchTemplateData {
  ImageId?: string;
  InstanceType?: string;
  KeyName?: string;
  IamInstanceProfile?: IamInstanceProfileSpec;
  UserData?: string;
}

interface LaunchTemplateVersion {
  LaunchTemplateId?: string;
  VersionNumber?: number;
  LaunchTemplateData?: LaunchTemplateData;
}

interface DescribeLaunchTemplateVersionsResponse {
  LaunchTemplateVersions?: LaunchTemplateVersion[];
}

interface SsmParameterValue {
  Parameter?: { Value?: string };
}

const SSM_RESOLVE_PREFIX = 'resolve:ssm:';

async function resolveSsmParam(
  raw: string,
  cwd: string,
): Promise<{ resolved: string; ssmParam?: string; ssmError?: string }> {
  if (!raw.startsWith(SSM_RESOLVE_PREFIX)) return { resolved: raw };
  // Format: resolve:ssm:/path/to/param  (optionally :version suffix)
  const rest = raw.slice(SSM_RESOLVE_PREFIX.length);
  const colonIdx = rest.lastIndexOf(':');
  // If a numeric version suffix is present, strip it. Otherwise the colon is
  // part of the parameter name (rare).
  const param =
    colonIdx > 0 && /^\d+$/.test(rest.slice(colonIdx + 1))
      ? rest.slice(0, colonIdx)
      : rest;
  try {
    const ssmOutput = await runCommand(
      'aws',
      [
        'ssm',
        'get-parameter',
        '--name',
        param,
        '--with-decryption',
        '--output',
        'json',
      ],
      cwd,
    );
    const data = JSON.parse(ssmOutput) as SsmParameterValue;
    return {
      resolved: data.Parameter?.Value ?? raw,
      ssmParam: param,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { resolved: raw, ssmParam: param, ssmError: message };
  }
}

const SAFE_LT_NAME_RE = /^[A-Za-z0-9._*-]+$/;

export async function ec2LaunchTemplateInspect(
  params: LaunchTemplateInspectParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const { environment = 'dev', name } = params;

  if (name !== undefined && !SAFE_LT_NAME_RE.test(name)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'Invalid name: only alphanumeric characters, dots, underscores, hyphens, and wildcards (*) are allowed.',
          }),
        },
      ],
      isError: true,
    };
  }

  const filters = [`Name=tag:Environment,Values=${environment}`];
  if (name) filters.push(`Name=tag:Name,Values=*${name}*`);

  // Step 1: list launch templates matching the environment (and optional name)
  let templates: LaunchTemplate[];
  try {
    const output = await runCommand(
      'aws',
      [
        'ec2',
        'describe-launch-templates',
        '--output',
        'json',
        ...filters.flatMap((f) => ['--filters', f]),
      ],
      repoRoot,
    );
    const data = JSON.parse(output) as DescribeLaunchTemplatesResponse;
    templates = data.LaunchTemplates ?? [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult('Failed to describe launch templates', message);
  }

  // Step 2: for each template, fetch the latest version data and resolve any
  // SSM-indirected ImageId. We process all templates in parallel via
  // Promise.all for faster results.
  const results = await Promise.all(
    templates.map(async (lt) => {
      const ltId = lt.LaunchTemplateId;
      const tagsObject: Record<string, string> = {};
      for (const t of lt.Tags ?? []) {
        if (t.Key !== undefined) tagsObject[t.Key] = t.Value ?? '';
      }
      if (!ltId) {
        return {
          launchTemplateId: null,
          name: lt.LaunchTemplateName ?? null,
          tags: tagsObject,
          error:
            'Missing LaunchTemplateId in describe-launch-templates response',
        };
      }
      try {
        const versionsOutput = await runCommand(
          'aws',
          [
            'ec2',
            'describe-launch-template-versions',
            '--launch-template-id',
            ltId,
            '--versions',
            '$Latest',
            '--output',
            'json',
          ],
          repoRoot,
        );
        const versionsData = JSON.parse(
          versionsOutput,
        ) as DescribeLaunchTemplateVersionsResponse;
        const latest = versionsData.LaunchTemplateVersions?.[0];
        const ltData = latest?.LaunchTemplateData ?? {};
        const rawImageId = ltData.ImageId ?? '';
        const {
          resolved: imageId,
          ssmParam,
          ssmError,
        } = rawImageId
          ? await resolveSsmParam(rawImageId, repoRoot)
          : { resolved: '' };

        return {
          launchTemplateId: ltId,
          name: lt.LaunchTemplateName ?? null,
          latestVersion:
            latest?.VersionNumber ?? lt.LatestVersionNumber ?? null,
          imageId: imageId || null,
          imageIdRaw: rawImageId || null,
          ssmParam: ssmParam ?? null,
          ssmError: ssmError ?? null,
          instanceType: ltData.InstanceType ?? null,
          keyName: ltData.KeyName ?? null,
          iamInstanceProfile:
            ltData.IamInstanceProfile?.Name ??
            ltData.IamInstanceProfile?.Arn ??
            null,
          hasUserData: ltData.UserData != null,
          tags: tagsObject,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          launchTemplateId: ltId,
          name: lt.LaunchTemplateName ?? null,
          tags: tagsObject,
          error: message,
          remedy: SSO_ERROR_PATTERN.test(message) ? ssoRemedy() : undefined,
        };
      }
    }),
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { count: results.length, launchTemplates: results },
          null,
          2,
        ),
      },
    ],
  };
}

// aws_ec2_network_inspect
// ---------------------------------------------------------------------------

export interface NetworkInspectParams {
  environment?: string;
  subnetType?: 'public' | 'private' | 'all';
}

interface AwsVpc {
  VpcId?: string;
  CidrBlock?: string;
  Tags?: Ec2Tag[];
}

interface DescribeVpcsResponse {
  Vpcs?: AwsVpc[];
}

interface AwsSubnet {
  SubnetId?: string;
  VpcId?: string;
  CidrBlock?: string;
  AvailabilityZone?: string;
  MapPublicIpOnLaunch?: boolean;
  Tags?: Ec2Tag[];
}

interface DescribeSubnetsResponse {
  Subnets?: AwsSubnet[];
}

function classifySubnet(subnet: AwsSubnet): 'public' | 'private' | 'database' {
  // Prefer the Name tag for explicit categorization since the project tags
  // subnets as legacy-sports-{env}-{public|private|database}-{n}.
  const name = getTag(subnet.Tags, 'Name') ?? '';
  if (/database/i.test(name)) return 'database';
  if (/public/i.test(name)) return 'public';
  if (/private/i.test(name)) return 'private';
  // Fallback: rely on MapPublicIpOnLaunch (only public subnets typically have
  // this true).
  return subnet.MapPublicIpOnLaunch ? 'public' : 'private';
}

export async function ec2NetworkInspect(
  params: NetworkInspectParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const { environment = 'dev', subnetType = 'all' } = params;

  // Step 1: locate the project VPC. Try the project Name tag first
  // (legacy-sports-{env}-vpc); fall back to the Environment tag.
  let vpc: AwsVpc | undefined;
  const vpcCandidates: AwsVpc[] = [];
  try {
    const byNameOutput = await runCommand(
      'aws',
      [
        'ec2',
        'describe-vpcs',
        '--output',
        'json',
        '--filters',
        `Name=tag:Name,Values=legacy-sports-${environment}-vpc`,
      ],
      repoRoot,
    );
    const byName = JSON.parse(byNameOutput) as DescribeVpcsResponse;
    vpcCandidates.push(...(byName.Vpcs ?? []));

    if (vpcCandidates.length === 0) {
      const byEnvOutput = await runCommand(
        'aws',
        [
          'ec2',
          'describe-vpcs',
          '--output',
          'json',
          '--filters',
          `Name=tag:Environment,Values=${environment}`,
        ],
        repoRoot,
      );
      const byEnv = JSON.parse(byEnvOutput) as DescribeVpcsResponse;
      vpcCandidates.push(...(byEnv.Vpcs ?? []));
    }

    if (vpcCandidates.length > 1) {
      const ids = vpcCandidates.map((v) => v.VpcId).join(', ');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              environment,
              error: `Multiple VPCs matched for environment "${environment}" (${ids}). Refine the environment name or VPC tags so exactly one VPC is selected.`,
            }),
          },
        ],
        isError: true,
      };
    }
    vpc = vpcCandidates[0];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult('Failed to describe VPCs', message);
  }

  if (!vpc?.VpcId) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            environment,
            error: `No VPC found for environment "${environment}". Looked for tag:Name=legacy-sports-${environment}-vpc and tag:Environment=${environment}.`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Step 2: enumerate subnets in that VPC.
  let subnets: AwsSubnet[] = [];
  try {
    const subnetsOutput = await runCommand(
      'aws',
      [
        'ec2',
        'describe-subnets',
        '--output',
        'json',
        '--filters',
        `Name=vpc-id,Values=${vpc.VpcId}`,
      ],
      repoRoot,
    );
    const subnetsData = JSON.parse(subnetsOutput) as DescribeSubnetsResponse;
    subnets = subnetsData.Subnets ?? [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult('Failed to describe subnets', message);
  }

  const grouped: {
    public: Array<Record<string, unknown>>;
    private: Array<Record<string, unknown>>;
    database: Array<Record<string, unknown>>;
  } = { public: [], private: [], database: [] };

  for (const s of subnets) {
    const category = classifySubnet(s);
    const entry = {
      id: s.SubnetId,
      az: s.AvailabilityZone,
      cidr: s.CidrBlock,
      name: getTag(s.Tags, 'Name') ?? null,
      mapPublicIpOnLaunch: s.MapPublicIpOnLaunch ?? false,
    };
    grouped[category].push(entry);
  }

  // Apply subnetType filter (default "all" returns everything)
  const finalSubnets =
    subnetType === 'all'
      ? grouped
      : subnetType === 'public'
        ? { public: grouped.public, private: [], database: [] }
        : { public: [], private: grouped.private, database: [] };

  const vpcTags: Record<string, string> = {};
  for (const t of vpc.Tags ?? []) {
    if (t.Key !== undefined) vpcTags[t.Key] = t.Value ?? '';
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            environment,
            vpc: {
              id: vpc.VpcId,
              cidr: vpc.CidrBlock,
              name: vpcTags.Name ?? null,
              tags: vpcTags,
            },
            subnets: finalSubnets,
            counts: {
              public: finalSubnets.public.length,
              private: finalSubnets.private.length,
              database: finalSubnets.database.length,
            },
          },
          null,
          2,
        ),
      },
    ],
  };
}
