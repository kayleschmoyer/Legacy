import {
  markdownTable,
  minifiedJson,
  pickFields,
} from '@legacy-sports/mcp-format';
import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';
import { SSO_ERROR_PATTERN, errorResult, ssoRemedy } from '../aws-error.js';
import { EC2_INSTANCE_COLUMNS } from '../format.js';

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
  StateReason?: { Code?: string; Message?: string };
  StateTransitionReason?: string;
  InstanceLifecycle?: string;
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
      stateReason: i.StateReason?.Message ?? i.StateTransitionReason ?? null,
      instanceLifecycle: i.InstanceLifecycle ?? null,
      name: getTag(i.Tags, 'Name'),
      publicIp: i.PublicIpAddress ?? null,
      privateIp: i.PrivateIpAddress ?? null,
      launchTime: i.LaunchTime,
      imageId: i.ImageId,
      keyName: i.KeyName ?? null,
      architecture: i.Architecture,
    }));

    // Flat, uniform list -> Markdown table (column headers written once). The
    // unadvertised `architecture` field is pruned by EC2_INSTANCE_COLUMNS.
    const text =
      formatted.length === 0
        ? 'No EC2 instances found.'
        : markdownTable(pickFields(formatted, EC2_INSTANCE_COLUMNS), {
            columns: EC2_INSTANCE_COLUMNS,
          });

    return {
      content: [{ type: 'text', text }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult('Failed to describe EC2 instances', message);
  }
}

// ---------------------------------------------------------------------------
// aws_ec2_describe_image
// ---------------------------------------------------------------------------

export interface Ec2DescribeImageParams {
  imageId: string;
  tag?: string;
}

interface AwsImage {
  ImageId?: string;
  Name?: string;
  CreationDate?: string;
  State?: string;
  Architecture?: string;
  OwnerId?: string;
  Description?: string;
  Tags?: Ec2Tag[];
}

interface DescribeImagesResponse {
  Images?: AwsImage[];
}

const IMAGE_ID_RE = /^ami-[0-9a-f]{8,17}$/;
const SAFE_TAG_KEY_RE = /^[A-Za-z0-9._:/+=@\- ]+$/;

export async function ec2DescribeImage(
  params: Ec2DescribeImageParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const { imageId } = params;
  let tag = params.tag;

  if (!IMAGE_ID_RE.test(imageId)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Invalid imageId "${imageId}": must match ami-[0-9a-f]{8,17}.`,
          }),
        },
      ],
      isError: true,
    };
  }

  if (tag !== undefined) {
    tag = tag.trim();
    if (tag === '') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: 'tag must not be empty or whitespace-only.',
            }),
          },
        ],
        isError: true,
      };
    }
  }
  if (tag !== undefined && !SAFE_TAG_KEY_RE.test(tag)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Invalid tag key "${tag}": must contain only alphanumerics, dots, underscores, colons, slashes, plus, equals, at, hyphens, and spaces.`,
          }),
        },
      ],
      isError: true,
    };
  }

  const args = [
    'ec2',
    'describe-images',
    '--image-ids',
    imageId,
    '--output',
    'json',
  ];

  try {
    const output = await runCommand('aws', args, repoRoot);
    const data = JSON.parse(output) as DescribeImagesResponse;
    const image = data.Images?.[0];

    if (!image) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              imageId,
              error: `AMI ${imageId} not found or not accessible to this account.`,
            }),
          },
        ],
        isError: true,
      };
    }

    const tagsObject: Record<string, string> = {};
    for (const t of image.Tags ?? []) {
      if (t.Key !== undefined) tagsObject[t.Key] = t.Value ?? '';
    }

    if (tag !== undefined) {
      const value = tagsObject[tag];
      return {
        content: [
          {
            type: 'text',
            text: minifiedJson({
              ok: true,
              imageId: image.ImageId ?? '',
              tag,
              value: value ?? null,
              found: value !== undefined,
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            ok: true,
            imageId: image.ImageId ?? '',
            name: image.Name,
            creationDate: image.CreationDate,
            state: image.State,
            architecture: image.Architecture,
            ownerId: image.OwnerId,
            description: image.Description ?? null,
            tags: tagsObject,
          }),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Failed to describe image ${imageId}`, message);
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

    // The EC2 API returns Output base64-encoded, but the AWS CLI decodes it
    // for us before we ever see it (a built-in CLI customization that runs
    // regardless of --output format, not just --output text) — see
    // https://docs.aws.amazon.com/cli/latest/reference/ec2/get-console-output.html.
    // `data.Output` here is already plain text; re-running it through
    // Buffer.from(..., 'base64') treats decoded text as base64 and produces
    // mojibake (replacement characters interleaved with ESC sequences) on
    // any output containing bytes outside the base64 alphabet, which is most
    // real kernel/cloud-init logs.

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            ok: true,
            instanceId: data.InstanceId,
            timestamp: data.Timestamp ?? null,
            output: data.Output ?? '(no console output available)',
          }),
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

/**
 * SSM parameter name allowlist. `runCommand` executes with `shell: true`, so the
 * resolved name must be validated before interpolation into `aws ssm
 * get-parameter --name <param>` to prevent shell injection. SSM names are
 * alphanumerics plus `_.-/`, optionally leading-slash-qualified.
 */
const SAFE_SSM_PARAM_RE = /^\/?[A-Za-z0-9_.\-/]+$/;

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
  // Refuse to query an SSM name containing shell metacharacters — it is
  // interpolated into a shell: true runCommand below.
  if (!SAFE_SSM_PARAM_RE.test(param)) {
    return {
      resolved: raw,
      ssmParam: param,
      ssmError: `Invalid SSM parameter name "${param}"; refusing to query (only alphanumerics and _.-/ are allowed).`,
    };
  }
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
        text: minifiedJson({
          ok: true,
          count: results.length,
          launchTemplates: results,
        }),
      },
    ],
  };
}

// aws_ec2_network_inspect
// ---------------------------------------------------------------------------

export interface NetworkInspectParams {
  environment?: string;
  subnetType?: 'public' | 'private' | 'all';
  includeRouteTables?: boolean;
  includeNacls?: boolean;
  includeGateways?: boolean;
  includeDnsAttributes?: boolean;
}

const MAX_ARRAY_ENTRIES = 50;

function capEntries<T>(items: T[]): { items: T[]; truncated: boolean } {
  if (items.length <= MAX_ARRAY_ENTRIES) {
    return { items, truncated: false };
  }
  return { items: items.slice(0, MAX_ARRAY_ENTRIES), truncated: true };
}

interface AwsRoute {
  DestinationCidrBlock?: string;
  DestinationIpv6CidrBlock?: string;
  DestinationPrefixListId?: string;
  GatewayId?: string;
  NatGatewayId?: string;
  InstanceId?: string;
  TransitGatewayId?: string;
  VpcPeeringConnectionId?: string;
  LocalGatewayId?: string;
  CarrierGatewayId?: string;
  State?: string;
}

interface AwsRouteTableAssociation {
  SubnetId?: string;
  Main?: boolean;
}

interface AwsRouteTable {
  RouteTableId?: string;
  Routes?: AwsRoute[];
  Associations?: AwsRouteTableAssociation[];
  Tags?: Ec2Tag[];
}

interface DescribeRouteTablesResponse {
  RouteTables?: AwsRouteTable[];
}

function mapRoute(route: AwsRoute): {
  destination: string | null;
  targetType: string | null;
  target: string | null;
  state: string | null;
} {
  const destination =
    route.DestinationCidrBlock ??
    route.DestinationIpv6CidrBlock ??
    route.DestinationPrefixListId ??
    null;
  const targets: Array<[string, string | undefined]> = [
    ['gateway', route.GatewayId],
    ['natGateway', route.NatGatewayId],
    ['instance', route.InstanceId],
    ['transitGateway', route.TransitGatewayId],
    ['vpcPeeringConnection', route.VpcPeeringConnectionId],
    ['localGateway', route.LocalGatewayId],
    ['carrierGateway', route.CarrierGatewayId],
  ];
  const match = targets.find(([, value]) => value !== undefined);
  return {
    destination,
    targetType: match?.[0] ?? null,
    target: match?.[1] ?? null,
    state: route.State ?? null,
  };
}

function mapRouteTable(table: AwsRouteTable): Record<string, unknown> {
  const { items: routes, truncated } = capEntries(
    (table.Routes ?? []).map(mapRoute),
  );
  return {
    id: table.RouteTableId ?? null,
    associations: (table.Associations ?? [])
      .map((a) => (a.Main ? 'main' : a.SubnetId))
      .filter((v): v is string => Boolean(v)),
    routes,
    routesTruncated: truncated,
    name: getTag(table.Tags, 'Name') ?? null,
  };
}

interface AwsNaclEntry {
  RuleNumber?: number;
  Protocol?: string;
  RuleAction?: string;
  Egress?: boolean;
  CidrBlock?: string;
  Ipv6CidrBlock?: string;
  PortRange?: { From?: number; To?: number };
}

interface AwsNaclAssociation {
  SubnetId?: string;
}

interface AwsNacl {
  NetworkAclId?: string;
  IsDefault?: boolean;
  Entries?: AwsNaclEntry[];
  Associations?: AwsNaclAssociation[];
  Tags?: Ec2Tag[];
}

interface DescribeNetworkAclsResponse {
  NetworkAcls?: AwsNacl[];
}

function mapNaclEntry(entry: AwsNaclEntry): Record<string, unknown> {
  return {
    ruleNumber: entry.RuleNumber ?? null,
    protocol: entry.Protocol ?? null,
    ruleAction: entry.RuleAction ?? null,
    cidrBlock: entry.CidrBlock ?? entry.Ipv6CidrBlock ?? null,
    portRange: entry.PortRange
      ? { from: entry.PortRange.From ?? null, to: entry.PortRange.To ?? null }
      : null,
  };
}

function mapNacl(nacl: AwsNacl): Record<string, unknown> {
  const entries = nacl.Entries ?? [];
  const { items: inbound, truncated: inboundTruncated } = capEntries(
    entries.filter((e) => !e.Egress).map(mapNaclEntry),
  );
  const { items: outbound, truncated: outboundTruncated } = capEntries(
    entries.filter((e) => e.Egress).map(mapNaclEntry),
  );
  return {
    id: nacl.NetworkAclId ?? null,
    isDefault: nacl.IsDefault ?? false,
    associations: (nacl.Associations ?? [])
      .map((a) => a.SubnetId)
      .filter((v): v is string => Boolean(v)),
    inbound,
    outbound,
    entriesTruncated: inboundTruncated || outboundTruncated,
    name: getTag(nacl.Tags, 'Name') ?? null,
  };
}

interface AwsIgwAttachment {
  VpcId?: string;
  State?: string;
}

interface AwsInternetGateway {
  InternetGatewayId?: string;
  Attachments?: AwsIgwAttachment[];
  Tags?: Ec2Tag[];
}

interface DescribeInternetGatewaysResponse {
  InternetGateways?: AwsInternetGateway[];
}

function mapInternetGateway(igw: AwsInternetGateway): Record<string, unknown> {
  return {
    id: igw.InternetGatewayId ?? null,
    state: igw.Attachments?.[0]?.State ?? null,
    vpcId: igw.Attachments?.[0]?.VpcId ?? null,
    name: getTag(igw.Tags, 'Name') ?? null,
  };
}

interface VpcAttributeResponse {
  EnableDnsSupport?: { Value?: boolean };
  EnableDnsHostnames?: { Value?: boolean };
}

async function describeVpcAttribute(
  vpcId: string,
  attribute: 'enableDnsSupport' | 'enableDnsHostnames',
  cwd: string,
): Promise<boolean | null> {
  const output = await runCommand(
    'aws',
    [
      'ec2',
      'describe-vpc-attribute',
      '--vpc-id',
      vpcId,
      '--attribute',
      attribute,
      '--output',
      'json',
    ],
    cwd,
  );
  const data = JSON.parse(output) as VpcAttributeResponse;
  return data.EnableDnsSupport?.Value ?? data.EnableDnsHostnames?.Value ?? null;
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
  const {
    environment = 'dev',
    subnetType = 'all',
    includeRouteTables = false,
    includeNacls = false,
    includeGateways = false,
    includeDnsAttributes = false,
  } = params;

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

  // Step 3: optional depth flags — each is an independent describe-* call,
  // run in parallel. A failure in one does not block the others; it is
  // reported as an `error` field alongside the requested section instead of
  // failing the whole tool call, since the caller already has the VPC and
  // subnet data by this point.
  const vpcId = vpc.VpcId;

  const [routeTablesResult, naclsResult, gatewaysResult, dnsResult] =
    await Promise.all([
      includeRouteTables
        ? (async () => {
            try {
              const output = await runCommand(
                'aws',
                [
                  'ec2',
                  'describe-route-tables',
                  '--output',
                  'json',
                  '--filters',
                  `Name=vpc-id,Values=${vpcId}`,
                ],
                repoRoot,
              );
              const data = JSON.parse(output) as DescribeRouteTablesResponse;
              const { items, truncated } = capEntries(data.RouteTables ?? []);
              return { items: items.map(mapRouteTable), truncated };
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              return { error: message };
            }
          })()
        : undefined,
      includeNacls
        ? (async () => {
            try {
              const output = await runCommand(
                'aws',
                [
                  'ec2',
                  'describe-network-acls',
                  '--output',
                  'json',
                  '--filters',
                  `Name=vpc-id,Values=${vpcId}`,
                ],
                repoRoot,
              );
              const data = JSON.parse(output) as DescribeNetworkAclsResponse;
              const { items, truncated } = capEntries(data.NetworkAcls ?? []);
              return { items: items.map(mapNacl), truncated };
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              return { error: message };
            }
          })()
        : undefined,
      includeGateways
        ? (async () => {
            try {
              const output = await runCommand(
                'aws',
                [
                  'ec2',
                  'describe-internet-gateways',
                  '--output',
                  'json',
                  '--filters',
                  `Name=attachment.vpc-id,Values=${vpcId}`,
                ],
                repoRoot,
              );
              const data = JSON.parse(
                output,
              ) as DescribeInternetGatewaysResponse;
              const { items, truncated } = capEntries(
                data.InternetGateways ?? [],
              );
              return { items: items.map(mapInternetGateway), truncated };
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              return { error: message };
            }
          })()
        : undefined,
      includeDnsAttributes && vpcId
        ? (async () => {
            try {
              const [enableDnsSupport, enableDnsHostnames] = await Promise.all([
                describeVpcAttribute(vpcId, 'enableDnsSupport', repoRoot),
                describeVpcAttribute(vpcId, 'enableDnsHostnames', repoRoot),
              ]);
              return { enableDnsSupport, enableDnsHostnames };
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              return { error: message };
            }
          })()
        : undefined,
    ]);

  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({
          ok: true,
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
          ...(routeTablesResult ? { routeTables: routeTablesResult } : {}),
          ...(naclsResult ? { networkAcls: naclsResult } : {}),
          ...(gatewaysResult ? { internetGateways: gatewaysResult } : {}),
          ...(dnsResult ? { dnsAttributes: dnsResult } : {}),
        }),
      },
    ],
  };
}
