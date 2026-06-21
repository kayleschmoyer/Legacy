jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import { runCommand } from '../run-command.js';
import {
  ec2DescribeImage,
  ec2Instances,
  ec2LaunchTemplateInspect,
} from './ec2.js';

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
      'instanceId|instanceType|state|name|publicIp|privateIp|launchTime|imageId|keyName',
    );
    expect(lines[1]).toBe('---|---|---|---|---|---|---|---|---');
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
});

describe('ec2LaunchTemplateInspect resolveSsmParam validation', () => {
  it('refuses to query an SSM parameter name containing shell metacharacters', async () => {
    mockedRun.mockImplementation(async (_cmd, args) => {
      const a = args as string[];
      if (a.includes('describe-launch-templates')) {
        return JSON.stringify({
          LaunchTemplates: [
            {
              LaunchTemplateId: 'lt-0123',
              LaunchTemplateName: 'runner',
              Tags: [],
            },
          ],
        });
      }
      if (a.includes('describe-launch-template-versions')) {
        return JSON.stringify({
          LaunchTemplateVersions: [
            {
              VersionNumber: 1,
              LaunchTemplateData: {
                ImageId: 'resolve:ssm:/bad;rm -rf /',
                InstanceType: 't3.medium',
              },
            },
          ],
        });
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
