jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import {
  ec2ConsoleOutput,
  ec2DescribeImage,
  ec2Instances,
  ec2LaunchTemplateInspect,
  ec2NetworkInspect,
} from './ec2.js';
import { runCommand } from '../run-command.js';

const mockedRun = runCommand as jest.MockedFunction<typeof runCommand>;

function text(result: Awaited<ReturnType<typeof ec2Instances>>): string {
  const block = result.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Expected a text content block');
  }
  return block.text;
}

beforeEach(() => {
  mockedRun.mockReset();
});

describe('ec2Instances', () => {
  const describeResponse = JSON.stringify({
    Reservations: [
      {
        Instances: [
          {
            InstanceId: 'i-0abc1234def567890',
            InstanceType: 't3.medium',
            State: { Name: 'running' },
            PublicIpAddress: '1.2.3.4',
            PrivateIpAddress: '10.0.0.5',
            LaunchTime: '2026-01-01T00:00:00.000Z',
            Tags: [{ Key: 'Name', Value: 'runner-1' }],
            Architecture: 'x86_64',
            ImageId: 'ami-0123456789abcdef0',
            KeyName: 'deploy-key',
          },
        ],
      },
    ],
  });

  it('renders a Markdown table with headers written once (not pretty JSON)', async () => {
    mockedRun.mockResolvedValue(describeResponse);
    const out = text(await ec2Instances({ environment: 'dev' }));

    const lines = out.split('\n');
    expect(lines[0]).toBe(
      'instanceId|instanceType|state|stateReason|instanceLifecycle|name|publicIp|privateIp|launchTime|imageId|keyName',
    );
    expect(lines[1]).toBe('---|---|---|---|---|---|---|---|---|---|---');
    expect(lines[2]).toContain('i-0abc1234def567890');
    expect(lines[2]).toContain('runner-1');
    // Not pretty-printed JSON.
    expect(out).not.toContain('\n  "');
  });

  it('prunes the unadvertised architecture field', async () => {
    mockedRun.mockResolvedValue(describeResponse);
    const out = text(await ec2Instances({ environment: 'dev' }));
    expect(out).not.toContain('architecture');
    expect(out).not.toContain('x86_64');
  });

  it('returns an explicit empty signal when no instances match', async () => {
    mockedRun.mockResolvedValue(JSON.stringify({ Reservations: [] }));
    const out = text(await ec2Instances({ environment: 'dev' }));
    expect(out).toBe('No EC2 instances found.');
  });
});

describe('ec2DescribeImage', () => {
  it('returns minified JSON (no pretty-print indentation)', async () => {
    mockedRun.mockResolvedValue(
      JSON.stringify({
        Images: [
          {
            ImageId: 'ami-0123456789abcdef0',
            Name: 'runner-ami',
            CreationDate: '2026-01-01T00:00:00.000Z',
            State: 'available',
            Architecture: 'x86_64',
            OwnerId: '123456789012',
            Tags: [{ Key: 'PlaywrightVersion', Value: '1.50.0' }],
          },
        ],
      }),
    );
    const out = text(
      await ec2DescribeImage({ imageId: 'ami-0123456789abcdef0' }),
    );
    expect(out).not.toContain('\n');
    const parsed = JSON.parse(out) as {
      ok: boolean;
      imageId: string;
      tags: object;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.imageId).toBe('ami-0123456789abcdef0');
    expect(parsed.tags).toEqual({ PlaywrightVersion: '1.50.0' });
  });

  describe('nameFilter', () => {
    const image = (id: string, creationDate: string) => ({
      ImageId: id,
      Name: `legacy-sports-runner-android-${creationDate}`,
      CreationDate: creationDate,
      State: 'available',
      Tags: [{ Key: 'PlaywrightVersion', Value: '1.50.0' }],
    });

    it('searches self-owned images by name and returns newest first', async () => {
      mockedRun.mockResolvedValue(
        JSON.stringify({
          Images: [
            image('ami-0000000000000000a', '2026-08-01T00:00:00.000Z'),
            image('ami-0000000000000000c', '2026-09-30T00:00:00.000Z'),
            image('ami-0000000000000000b', '2026-09-01T00:00:00.000Z'),
          ],
        }),
      );
      const out = text(
        await ec2DescribeImage({
          nameFilter: 'legacy-sports-runner-android-*',
        }),
      );
      const args = mockedRun.mock.calls[0][1];
      expect(args[args.indexOf('--owners') + 1]).toBe('self');
      expect(args[args.indexOf('--filters') + 1]).toBe(
        'Name=name,Values=legacy-sports-runner-android-*',
      );
      expect(args).not.toContain('--image-ids');

      const parsed = JSON.parse(out) as {
        ok: boolean;
        count: number;
        images: Array<{ imageId: string; tags: object }>;
      };
      expect(parsed.ok).toBe(true);
      expect(parsed.images.map((i) => i.imageId)).toEqual([
        'ami-0000000000000000c',
        'ami-0000000000000000b',
        'ami-0000000000000000a',
      ]);
      expect(parsed.images[0].tags).toEqual({ PlaywrightVersion: '1.50.0' });
    });

    it('caps the result at the 10 newest matches and reports the total', async () => {
      mockedRun.mockResolvedValue(
        JSON.stringify({
          Images: Array.from({ length: 12 }, (_, i) =>
            image(
              `ami-00000000000000${String(i).padStart(2, '0')}a`,
              `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
            ),
          ),
        }),
      );
      const parsed = JSON.parse(
        text(await ec2DescribeImage({ nameFilter: 'legacy-*' })),
      ) as {
        count: number;
        totalMatches: number;
        images: Array<{ creationDate: string }>;
      };
      expect(parsed.count).toBe(10);
      expect(parsed.totalMatches).toBe(12);
      expect(parsed.images[0].creationDate).toBe('2026-09-12T00:00:00.000Z');
    });

    it('returns only the requested tag per image when tag is set', async () => {
      mockedRun.mockResolvedValue(
        JSON.stringify({
          Images: [image('ami-0000000000000000a', '2026-08-01T00:00:00.000Z')],
        }),
      );
      const parsed = JSON.parse(
        text(
          await ec2DescribeImage({
            nameFilter: 'legacy-*',
            tag: 'PlaywrightVersion',
          }),
        ),
      ) as { images: Array<Record<string, unknown>> };
      expect(parsed.images[0].PlaywrightVersion).toBe('1.50.0');
      expect(parsed.images[0].tags).toBeUndefined();
    });

    it('rejects an unsafe nameFilter without calling AWS', async () => {
      const result = await ec2DescribeImage({ nameFilter: 'a,Name=x' });
      expect(result.isError).toBe(true);
      expect(mockedRun).not.toHaveBeenCalled();
    });

    it('rejects a call with neither imageId nor nameFilter', async () => {
      const result = await ec2DescribeImage({});
      expect(result.isError).toBe(true);
      expect(text(result)).toContain('Either imageId or nameFilter');
    });
  });
});

describe('ec2ConsoleOutput', () => {
  it('passes the CLI-decoded Output straight through (no re-decode as base64)', async () => {
    // The AWS CLI's get-console-output customization already base64-decodes
    // Output for every --output format, so `aws ec2 get-console-output
    // --output json` hands back plain text here — including bytes (ESC
    // sequences, high-bit chars from a Nitro console) that are not valid
    // base64. Re-running this through Buffer.from(text, 'base64') is what
    // produced the LS-4928 mojibake; asserting exact passthrough locks in
    // the fix.
    const decodedConsoleLog =
      '[    0.840651] usbcore: registered new interface driver usbfs\n' +
      '\x1b[0;32m  OK  \x1b[0mStarted OpenBSD Secure Shell server.\n' +
      'ci-info: +++ Authorized keys from /home/ubuntu/.ssh/authorized_keys \xe9\xff +++';

    mockedRun.mockResolvedValue(
      JSON.stringify({
        InstanceId: 'i-0574f935ca44318d1',
        Timestamp: '2026-05-27T00:00:00.000Z',
        Output: decodedConsoleLog,
      }),
    );

    const out = text(
      await ec2ConsoleOutput({ instanceId: 'i-0574f935ca44318d1' }),
    );
    const parsed = JSON.parse(out) as { ok: boolean; output: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.output).toBe(decodedConsoleLog);
    expect(parsed.output).not.toContain('�');
  });

  it('reports no console output available when Output is absent', async () => {
    mockedRun.mockResolvedValue(
      JSON.stringify({
        InstanceId: 'i-0574f935ca44318d1',
        Timestamp: '2026-05-27T00:00:00.000Z',
      }),
    );

    const out = text(
      await ec2ConsoleOutput({ instanceId: 'i-0574f935ca44318d1' }),
    );
    const parsed = JSON.parse(out) as { output: string };
    expect(parsed.output).toBe('(no console output available)');
  });
});

describe('ec2LaunchTemplateInspect resolveSsmParam validation', () => {
  it('refuses to query an SSM parameter name containing shell metacharacters', async () => {
    mockedRun.mockImplementation((_cmd, args) => {
      const a = args;
      if (a.includes('describe-launch-templates')) {
        return Promise.resolve(
          JSON.stringify({
            LaunchTemplates: [
              {
                LaunchTemplateId: 'lt-0123',
                LaunchTemplateName: 'runner',
                Tags: [],
              },
            ],
          }),
        );
      }
      if (a.includes('describe-launch-template-versions')) {
        return Promise.resolve(
          JSON.stringify({
            LaunchTemplateVersions: [
              {
                VersionNumber: 1,
                LaunchTemplateData: {
                  ImageId: 'resolve:ssm:/bad;rm -rf /',
                  InstanceType: 't3.medium',
                },
              },
            ],
          }),
        );
      }
      // get-parameter must never be reached for an unsafe name.
      throw new Error('unexpected runCommand call: ' + a.join(' '));
    });

    const result = await ec2LaunchTemplateInspect({ environment: 'dev' });
    const block = result.content[0];
    if (!block || block.type !== 'text') throw new Error('expected text block');
    const parsed = JSON.parse(block.text) as {
      launchTemplates: Array<{ ssmError?: string; imageId: string | null }>;
    };
    expect(parsed.launchTemplates[0].ssmError).toMatch(
      /Invalid SSM parameter name/,
    );
    // Unsafe name is left unresolved (raw value preserved), never queried.
    expect(parsed.launchTemplates[0].imageId).toBe('resolve:ssm:/bad;rm -rf /');
    // describe-launch-templates + describe-versions only — no get-parameter.
    expect(mockedRun).toHaveBeenCalledTimes(2);
  });
});

describe('ec2NetworkInspect', () => {
  const vpcResponse = JSON.stringify({
    Vpcs: [
      {
        VpcId: 'vpc-0abc123',
        CidrBlock: '10.0.0.0/16',
        Tags: [{ Key: 'Name', Value: 'legacy-sports-dev-vpc' }],
      },
    ],
  });
  const subnetsResponse = JSON.stringify({ Subnets: [] });

  function mockRunFor(handlers: Record<string, () => string>): void {
    mockedRun.mockImplementation((_cmd, args) => {
      const a = args;
      if (a.includes('describe-vpcs')) return Promise.resolve(vpcResponse);
      if (a.includes('describe-subnets'))
        return Promise.resolve(subnetsResponse);
      for (const [key, handler] of Object.entries(handlers)) {
        if (a.includes(key)) return Promise.resolve(handler());
      }
      // Flow logs are always queried; default to none unless a test overrides.
      if (a.includes('describe-flow-logs'))
        return Promise.resolve(JSON.stringify({ FlowLogs: [] }));
      throw new Error('unexpected runCommand call: ' + a.join(' '));
    });
  }

  async function body(
    params: Parameters<typeof ec2NetworkInspect>[0],
  ): Promise<Record<string, unknown>> {
    const result = await ec2NetworkInspect(params);
    const block = result.content[0];
    if (!block || block.type !== 'text') throw new Error('expected text block');
    return JSON.parse(block.text) as Record<string, unknown>;
  }

  it('omits all optional sections by default', async () => {
    mockRunFor({});
    const parsed = await body({ environment: 'dev' });
    expect(parsed.routeTables).toBeUndefined();
    expect(parsed.networkAcls).toBeUndefined();
    expect(parsed.internetGateways).toBeUndefined();
    expect(parsed.dnsAttributes).toBeUndefined();
  });

  it('always reports flow logs, empty when none are configured', async () => {
    mockRunFor({});
    const parsed = await body({ environment: 'dev' });
    expect(parsed.flowLogs).toEqual({ items: [], truncated: false });
  });

  it('reports flow logs attached to the VPC or its subnets', async () => {
    mockedRun.mockImplementation((_cmd, args) => {
      if (args.includes('describe-vpcs')) return Promise.resolve(vpcResponse);
      if (args.includes('describe-subnets'))
        return Promise.resolve(
          JSON.stringify({ Subnets: [{ SubnetId: 'subnet-1' }] }),
        );
      if (args.includes('describe-flow-logs'))
        return Promise.resolve(
          JSON.stringify({
            FlowLogs: [
              {
                FlowLogId: 'fl-1',
                ResourceId: 'vpc-0abc123',
                TrafficType: 'REJECT',
                FlowLogStatus: 'ACTIVE',
                LogDestinationType: 'cloud-watch-logs',
                LogGroupName: '/vpc/flow-logs',
              },
            ],
          }),
        );
      throw new Error('unexpected runCommand call: ' + args.join(' '));
    });
    const parsed = await body({ environment: 'dev' });
    expect(parsed.flowLogs).toEqual({
      items: [
        {
          id: 'fl-1',
          resourceId: 'vpc-0abc123',
          trafficType: 'REJECT',
          status: 'ACTIVE',
          destinationType: 'cloud-watch-logs',
          destination: '/vpc/flow-logs',
        },
      ],
      truncated: false,
    });
    const flowArgs = mockedRun.mock.calls
      .map((c) => c[1])
      .find((a) => a.includes('describe-flow-logs'));
    expect(flowArgs).toContain('Name=resource-id,Values=vpc-0abc123,subnet-1');
  });

  it('reports a flow-log lookup failure without failing the call', async () => {
    mockRunFor({
      'describe-flow-logs': () => {
        throw new Error('UnauthorizedOperation');
      },
    });
    const parsed = await body({ environment: 'dev' });
    expect(parsed.ok).toBe(true);
    expect(parsed.flowLogs).toEqual({ error: 'UnauthorizedOperation' });
  });

  it('includeRouteTables returns routes with destination + target', async () => {
    mockRunFor({
      'describe-route-tables': () =>
        JSON.stringify({
          RouteTables: [
            {
              RouteTableId: 'rtb-1',
              Associations: [{ SubnetId: 'subnet-1' }, { Main: true }],
              Routes: [
                {
                  DestinationCidrBlock: '0.0.0.0/0',
                  GatewayId: 'igw-1',
                  State: 'active',
                },
                {
                  DestinationCidrBlock: '10.0.0.0/16',
                  GatewayId: 'local',
                  State: 'active',
                },
              ],
            },
          ],
        }),
    });
    const parsed = await body({
      environment: 'dev',
      includeRouteTables: true,
    });
    const routeTables = parsed.routeTables as {
      items: Array<{
        id: string;
        associations: string[];
        routes: Array<{
          destination: string;
          targetType: string;
          target: string;
        }>;
      }>;
      truncated: boolean;
    };
    expect(routeTables.truncated).toBe(false);
    expect(routeTables.items).toHaveLength(1);
    expect(routeTables.items[0].id).toBe('rtb-1');
    expect(routeTables.items[0].associations).toEqual(['subnet-1', 'main']);
    expect(routeTables.items[0].routes[0]).toEqual({
      destination: '0.0.0.0/0',
      targetType: 'gateway',
      target: 'igw-1',
      state: 'active',
    });
  });

  it('includeNacls splits entries into inbound/outbound', async () => {
    mockRunFor({
      'describe-network-acls': () =>
        JSON.stringify({
          NetworkAcls: [
            {
              NetworkAclId: 'acl-1',
              IsDefault: true,
              Associations: [{ SubnetId: 'subnet-1' }],
              Entries: [
                {
                  RuleNumber: 100,
                  Protocol: '-1',
                  RuleAction: 'allow',
                  Egress: false,
                  CidrBlock: '0.0.0.0/0',
                },
                {
                  RuleNumber: 100,
                  Protocol: '-1',
                  RuleAction: 'allow',
                  Egress: true,
                  CidrBlock: '0.0.0.0/0',
                },
              ],
            },
          ],
        }),
    });
    const parsed = await body({ environment: 'dev', includeNacls: true });
    const nacls = parsed.networkAcls as {
      items: Array<{ inbound: unknown[]; outbound: unknown[] }>;
      truncated: boolean;
    };
    expect(nacls.items).toHaveLength(1);
    expect(nacls.items[0].inbound).toHaveLength(1);
    expect(nacls.items[0].outbound).toHaveLength(1);
  });

  it('includeGateways returns attached internet gateways', async () => {
    mockRunFor({
      'describe-internet-gateways': () =>
        JSON.stringify({
          InternetGateways: [
            {
              InternetGatewayId: 'igw-1',
              Attachments: [{ VpcId: 'vpc-0abc123', State: 'available' }],
              Tags: [{ Key: 'Name', Value: 'legacy-sports-dev-igw' }],
            },
          ],
        }),
    });
    const parsed = await body({ environment: 'dev', includeGateways: true });
    const gateways = parsed.internetGateways as {
      items: Array<{ id: string; state: string; vpcId: string; name: string }>;
      truncated: boolean;
    };
    expect(gateways.items).toEqual([
      {
        id: 'igw-1',
        state: 'available',
        vpcId: 'vpc-0abc123',
        name: 'legacy-sports-dev-igw',
      },
    ]);
  });

  it('includeDnsAttributes returns both DNS attribute values', async () => {
    mockedRun.mockImplementation((_cmd, args) => {
      const a = args;
      if (a.includes('describe-vpcs')) return Promise.resolve(vpcResponse);
      if (a.includes('describe-subnets'))
        return Promise.resolve(subnetsResponse);
      if (a.includes('describe-vpc-attribute')) {
        const attrIdx = a.indexOf('--attribute');
        const attribute = a[attrIdx + 1];
        if (attribute === 'enableDnsSupport') {
          return Promise.resolve(
            JSON.stringify({
              VpcId: 'vpc-0abc123',
              EnableDnsSupport: { Value: true },
            }),
          );
        }
        return Promise.resolve(
          JSON.stringify({
            VpcId: 'vpc-0abc123',
            EnableDnsHostnames: { Value: false },
          }),
        );
      }
      throw new Error('unexpected runCommand call: ' + a.join(' '));
    });
    const parsed = await body({
      environment: 'dev',
      includeDnsAttributes: true,
    });
    expect(parsed.dnsAttributes).toEqual({
      enableDnsSupport: true,
      enableDnsHostnames: false,
    });
  });

  it('caps route tables at 50 entries and reports truncated: true', async () => {
    const manyRouteTables = Array.from({ length: 60 }, (_, i) => ({
      RouteTableId: `rtb-${i}`,
      Associations: [],
      Routes: [],
    }));
    mockRunFor({
      'describe-route-tables': () =>
        JSON.stringify({ RouteTables: manyRouteTables }),
    });
    const parsed = await body({
      environment: 'dev',
      includeRouteTables: true,
    });
    const routeTables = parsed.routeTables as {
      items: unknown[];
      truncated: boolean;
    };
    expect(routeTables.items).toHaveLength(50);
    expect(routeTables.truncated).toBe(true);
  });
});
