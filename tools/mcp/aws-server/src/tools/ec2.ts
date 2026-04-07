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
