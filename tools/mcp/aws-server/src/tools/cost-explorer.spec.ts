jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import {
  costExplorer,
  type CostExplorerParams,
  ec2Bucket,
  previousPeriod,
} from './cost-explorer.js';
import { runCommand } from '../run-command.js';

const mockedRun = runCommand as jest.MockedFunction<typeof runCommand>;

function text(result: Awaited<ReturnType<typeof costExplorer>>): string {
  const block = result.content[0];
  if (!block || block.type !== 'text') throw new Error('Expected text block');
  return block.text;
}

type Groups = Record<string, [cost: number, usage?: number]>;

function ceResponse(
  byTime: Record<string, Groups>,
  nextPageToken?: string,
): string {
  return JSON.stringify({
    ResultsByTime: Object.entries(byTime).map(([start, groups]) => ({
      TimePeriod: { Start: start },
      Groups: Object.entries(groups).map(([key, [cost, usage]]) => ({
        Keys: [key],
        Metrics: {
          UnblendedCost: { Amount: String(cost), Unit: 'USD' },
          ...(usage === undefined
            ? {}
            : { UsageQuantity: { Amount: String(usage), Unit: 'N/A' } }),
        },
      })),
    })),
    NextPageToken: nextPageToken,
  });
}

interface MockOptions {
  /** Whether CostReportExclude is an active cost allocation tag. */
  tagActive?: boolean;
  /** Reject the list-cost-allocation-tags call. */
  tagLookupFails?: boolean;
  /** Cost responses keyed by window start date; arrays are served page by page. */
  windows: Record<string, string | string[]>;
}

function mockAws({ tagActive, tagLookupFails, windows }: MockOptions): void {
  const pages = new Map(
    Object.entries(windows).map(([start, value]) => [
      start,
      Array.isArray(value) ? [...value] : [value],
    ]),
  );
  mockedRun.mockImplementation((_command, args) => {
    if (args[1] === 'list-cost-allocation-tags') {
      if (tagLookupFails) return Promise.reject(new Error('AccessDenied'));
      return Promise.resolve(
        JSON.stringify({
          CostAllocationTags: tagActive
            ? [{ TagKey: 'CostReportExclude', Status: 'Active' }]
            : [],
        }),
      );
    }
    const period = args[args.indexOf('--time-period') + 1] ?? '';
    const start = /Start=([\d-]+)/.exec(period)?.[1] ?? '';
    const next = pages.get(start)?.shift();
    if (next === undefined) {
      return Promise.reject(new Error(`unexpected window ${period}`));
    }
    return Promise.resolve(next);
  });
}

/** Args of every get-cost-and-usage call, in call order. */
function costCalls(): string[][] {
  return mockedRun.mock.calls
    .map(([, args]) => args)
    .filter((args) => args[1] === 'get-cost-and-usage');
}

function argAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function filterOf(args: string[]): unknown {
  const raw = argAfter(args, '--filter');
  return raw === undefined ? undefined : JSON.parse(raw);
}

const SEPTEMBER: CostExplorerParams = {
  start: '2026-09-01',
  end: '2026-10-01',
};

beforeEach(() => {
  mockedRun.mockReset();
});

describe('ec2Bucket', () => {
  it.each([
    ['USE2-SpotUsage:c7i.2xlarge', 'spot'],
    ['SpotUsage:m5.large', 'spot'],
    ['BoxUsage:t3.medium', 'on-demand'],
    ['USE2-BoxUsage:c7i.xlarge', 'on-demand'],
    ['DataTransfer-Out-Bytes', 'egress'],
    ['USE2-DataTransfer-Out-Bytes', 'egress'],
    ['EBS:VolumeUsage.gp3', 'EBS'],
    ['USE2-EBS:VolumeP-IOPS.gp3', 'EBS'],
    ['EBS:SnapshotUsage', 'snapshot'],
    ['NatGateway-Hours', 'NAT'],
    ['USE2-NatGateway-Bytes', 'NAT'],
    ['DataTransfer-Regional-Bytes', 'other'],
    ['ElasticIP:IdleAddress', 'other'],
  ])('classifies %s as %s', (usageType, bucket) => {
    expect(ec2Bucket(usageType)).toBe(bucket);
  });
});

describe('previousPeriod', () => {
  it('shifts a calendar-month window by whole months', () => {
    expect(previousPeriod('2026-09-01', '2026-10-01')).toEqual({
      start: '2026-08-01',
      end: '2026-09-01',
    });
    // 31-day March compares with 28-day February, not the prior 31 days.
    expect(previousPeriod('2026-03-01', '2026-04-01')).toEqual({
      start: '2026-02-01',
      end: '2026-03-01',
    });
  });

  it('shifts a multi-month window across a year boundary', () => {
    expect(previousPeriod('2026-01-01', '2026-04-01')).toEqual({
      start: '2025-10-01',
      end: '2026-01-01',
    });
  });

  it('shifts an arbitrary window by its own length in days', () => {
    expect(previousPeriod('2026-09-10', '2026-09-17')).toEqual({
      start: '2026-09-03',
      end: '2026-09-10',
    });
  });
});

describe('costExplorer — validation', () => {
  it.each([
    [{ start: '09/01/2026', end: '2026-10-01' }, 'Invalid start'],
    [{ start: '2026-09-01', end: '2026-02-31' }, 'Invalid end'],
    [{ start: '2026-10-01', end: '2026-09-01' }, 'must be after start'],
    [{ start: '2026-09-01', end: '2026-09-01' }, 'must be after start'],
    [{ ...SEPTEMBER, groupBy: 'tag' as const }, 'requires tagKey'],
    [
      { ...SEPTEMBER, groupBy: 'tag' as const, tagKey: 'a"b' },
      'Invalid tagKey',
    ],
    [{ ...SEPTEMBER, service: 'x"; rm' }, 'Invalid service'],
  ])('rejects %j', async (params, message) => {
    const result = await costExplorer(params);
    expect(result.isError).toBe(true);
    expect(text(result)).toContain(message);
    expect(mockedRun).not.toHaveBeenCalled();
  });
});

describe('costExplorer — query construction', () => {
  it('queries monthly by service with the cost metric by default', async () => {
    mockAws({ windows: { '2026-09-01': ceResponse({}) } });

    await costExplorer(SEPTEMBER);

    const [args] = costCalls();
    expect(argAfter(args, '--time-period')).toBe(
      'Start=2026-09-01,End=2026-10-01',
    );
    expect(argAfter(args, '--granularity')).toBe('MONTHLY');
    expect(argAfter(args, '--group-by')).toBe('Type=DIMENSION,Key=SERVICE');
    expect(args).toContain('UnblendedCost');
    expect(args).not.toContain('UsageQuantity');
  });

  it.each([
    ['usage_type', undefined, 'Type=DIMENSION,Key=USAGE_TYPE'],
    ['instance_type', undefined, 'Type=DIMENSION,Key=INSTANCE_TYPE'],
    ['region', undefined, 'Type=DIMENSION,Key=REGION'],
    ['tag', 'Project', 'Type=TAG,Key=Project'],
  ] as const)('maps groupBy %s', async (groupBy, tagKey, expected) => {
    mockAws({ windows: { '2026-09-01': ceResponse({}) } });

    await costExplorer({ ...SEPTEMBER, groupBy, tagKey });

    expect(argAfter(costCalls()[0], '--group-by')).toBe(expected);
  });

  it('passes daily granularity and the UsageQuantity metric through', async () => {
    mockAws({ windows: { '2026-09-01': ceResponse({}) } });

    await costExplorer({
      ...SEPTEMBER,
      granularity: 'daily',
      metrics: ['UnblendedCost', 'UsageQuantity'],
    });

    const [args] = costCalls();
    expect(argAfter(args, '--granularity')).toBe('DAILY');
    expect(args).toContain('UsageQuantity');
  });

  it('expands the "ec2" service alias and ANDs it with the exclusion', async () => {
    mockAws({ windows: { '2026-09-01': ceResponse({}) } });

    await costExplorer({ ...SEPTEMBER, service: 'ec2' });

    expect(filterOf(costCalls()[0])).toEqual({
      And: [
        {
          Dimensions: {
            Key: 'SERVICE',
            Values: ['Amazon Elastic Compute Cloud - Compute', 'EC2 - Other'],
          },
        },
        { Not: { Dimensions: { Key: 'REGION', Values: ['us-east-2'] } } },
      ],
    });
  });

  it('passes any other service name through verbatim', async () => {
    mockAws({ windows: { '2026-09-01': ceResponse({}) } });

    await costExplorer({
      ...SEPTEMBER,
      service: 'Amazon Relational Database Service',
      includeExcluded: true,
    });

    expect(filterOf(costCalls()[0])).toEqual({
      Dimensions: {
        Key: 'SERVICE',
        Values: ['Amazon Relational Database Service'],
      },
    });
  });

  it('follows NextPageToken and sums every page', async () => {
    mockAws({
      windows: {
        '2026-09-01': [
          ceResponse({ '2026-09-01': { 'Amazon S3': [1.5] } }, 'page-2'),
          ceResponse({ '2026-09-01': { 'Amazon S3': [2.25] } }),
        ],
      },
    });

    const out = text(await costExplorer(SEPTEMBER));

    expect(costCalls()).toHaveLength(2);
    expect(argAfter(costCalls()[1], '--next-page-token')).toBe('page-2');
    expect(out).toContain('Amazon S3|3.75');
  });
});

describe('costExplorer — CostReportExclude exclusion', () => {
  const windows = { '2026-09-01': ceResponse({}) };

  it('falls back to excluding us-east-2 while the tag is not active, and says so', async () => {
    mockAws({ tagActive: false, windows });

    const out = text(await costExplorer(SEPTEMBER));

    expect(filterOf(costCalls()[0])).toEqual({
      Not: { Dimensions: { Key: 'REGION', Values: ['us-east-2'] } },
    });
    expect(out).toContain('Excludes region us-east-2 — FALLBACK');
    expect(out).toContain('not yet an active cost allocation tag');
  });

  it('filters on the tag once it is an active cost allocation tag', async () => {
    mockAws({ tagActive: true, windows });

    const out = text(await costExplorer(SEPTEMBER));

    expect(filterOf(costCalls()[0])).toEqual({
      Not: { Tags: { Key: 'CostReportExclude', Values: ['true'] } },
    });
    expect(out).toContain('Excludes resources tagged CostReportExclude=true');
    expect(out).not.toContain('FALLBACK');
  });

  it('uses the region fallback when the tag status cannot be read', async () => {
    mockAws({ tagLookupFails: true, windows });

    const out = text(await costExplorer(SEPTEMBER));

    expect(filterOf(costCalls()[0])).toEqual({
      Not: { Dimensions: { Key: 'REGION', Values: ['us-east-2'] } },
    });
    expect(out).toContain('FALLBACK');
  });

  it('applies no exclusion and skips the tag lookup with includeExcluded', async () => {
    mockAws({ windows });

    const out = text(
      await costExplorer({ ...SEPTEMBER, includeExcluded: true }),
    );

    expect(costCalls()[0]).not.toContain('--filter');
    expect(mockedRun).toHaveBeenCalledTimes(1);
    expect(out).toContain('Includes resources tagged CostReportExclude=true');
  });
});

describe('costExplorer — output', () => {
  it('renders rows sorted by cost with the total', async () => {
    mockAws({
      windows: {
        '2026-09-01': ceResponse({
          '2026-09-01': {
            'Amazon S3': [3.1],
            'EC2 - Other': [40.456],
            'AWS Lambda': [12],
          },
        }),
      },
    });

    const out = text(await costExplorer(SEPTEMBER));

    expect(out).toContain('Total: $55.56');
    expect(out).toContain(
      [
        'service|cost',
        '---|---',
        'EC2 - Other|40.46',
        'AWS Lambda|12.00',
        'Amazon S3|3.10',
      ].join('\n'),
    );
    expect(out).not.toContain('trend');
    expect(out).not.toContain('delta');
  });

  it('adds prev and delta columns against the previous period', async () => {
    mockAws({
      windows: {
        '2026-09-01': ceResponse({
          '2026-09-01': {
            'EC2 - Other': [60],
            'AWS Lambda': [10],
            'Amazon SQS': [2],
          },
        }),
        '2026-08-01': ceResponse({
          '2026-08-01': {
            'EC2 - Other': [40],
            'AWS Lambda': [20],
            'Amazon Route 53': [1],
          },
        }),
      },
    });

    const out = text(
      await costExplorer({ ...SEPTEMBER, compareWith: 'previousPeriod' }),
    );

    expect(argAfter(costCalls()[1], '--time-period')).toBe(
      'Start=2026-08-01,End=2026-09-01',
    );
    expect(out).toContain(
      'Total: $72.00 | previous 2026-08-01 → 2026-09-01: $61.00 | delta +11.00 (+18%)',
    );
    expect(out).toContain(
      [
        'service|cost|prev|delta',
        '---|---|---|---',
        'EC2 - Other|60.00|40.00|+20.00 (+50%)',
        'AWS Lambda|10.00|20.00|-10.00 (-50%)',
        'Amazon SQS|2.00|0.00|+2.00 (new)',
        'Amazon Route 53|0.00|1.00|-1.00 (-100%)',
      ].join('\n'),
    );
  });

  it('buckets EC2 usage types and labels each row with its bucket', async () => {
    mockAws({
      windows: {
        '2026-09-01': ceResponse({
          '2026-09-01': {
            'SpotUsage:c7i.2xlarge': [30, 400],
            'SpotUsage:c7i.xlarge': [10, 200],
            'BoxUsage:t3.medium': [5, 100],
            'DataTransfer-Out-Bytes': [9, 100],
            'EBS:VolumeUsage.gp3': [4, 50],
            'EBS:SnapshotUsage': [1, 20],
            'NatGateway-Hours': [2, 44],
          },
        }),
      },
    });

    const out = text(
      await costExplorer({
        ...SEPTEMBER,
        groupBy: 'usage_type',
        service: 'ec2',
        metrics: ['UnblendedCost', 'UsageQuantity'],
      }),
    );

    expect(out).toContain(
      [
        '### EC2 buckets',
        'bucket|cost|usage',
        '---|---|---',
        'spot|40.00|600',
        'egress|9.00|100',
        'on-demand|5.00|100',
        'EBS|4.00|50',
        'NAT|2.00|44',
        'snapshot|1.00|20',
      ].join('\n'),
    );
    expect(out).toContain('SpotUsage:c7i.2xlarge|spot|30.00|400');
    expect(out).toContain('EBS:SnapshotUsage|snapshot|1.00|20');
  });

  it('renders a per-period trend when the window spans several buckets', async () => {
    mockAws({
      windows: {
        '2026-09-01': ceResponse({
          '2026-09-02': { 'AWS Lambda': [2] },
          '2026-09-01': { 'AWS Lambda': [1], 'Amazon S3': [0.5] },
        }),
      },
    });

    const out = text(
      await costExplorer({
        start: '2026-09-01',
        end: '2026-09-03',
        granularity: 'daily',
      }),
    );

    expect(out).toContain(
      [
        '### Daily trend',
        'period|cost',
        '---|---',
        '2026-09-01|1.50',
        '2026-09-02|2.00',
      ].join('\n'),
    );
  });

  it('strips the tag key prefix and names the untagged group', async () => {
    mockAws({
      windows: {
        '2026-09-01': ceResponse({
          '2026-09-01': { 'Project$legacy-sports': [8], Project$: [3] },
        }),
      },
    });

    const out = text(
      await costExplorer({ ...SEPTEMBER, groupBy: 'tag', tagKey: 'Project' }),
    );

    expect(out).toContain('legacy-sports|8.00');
    expect(out).toContain('(untagged)|3.00');
  });

  it('caps rows at limit and reports how many were dropped', async () => {
    mockAws({
      windows: {
        '2026-09-01': ceResponse({
          '2026-09-01': { a: [3], b: [2], c: [1] },
        }),
      },
    });

    const out = text(await costExplorer({ ...SEPTEMBER, limit: 2 }));

    expect(out).toContain('a|3.00\nb|2.00\n…1 more rows');
    expect(out).not.toContain('c|1.00');
    // The total still covers the rows the cap hides.
    expect(out).toContain('Total: $6.00');
  });

  it('reports an empty window instead of an empty table', async () => {
    mockAws({ windows: { '2026-09-01': ceResponse({}) } });

    const out = text(await costExplorer(SEPTEMBER));

    expect(out).toContain('Total: $0.00');
    expect(out).toContain('No cost data for this window.');
  });
});

describe('costExplorer — errors', () => {
  it('returns an SSO remedy when the session has expired', async () => {
    mockedRun.mockRejectedValue(new Error('The SSO session has expired'));

    const result = await costExplorer(SEPTEMBER);

    expect(result.isError).toBe(true);
    const body = JSON.parse(text(result)) as { error: string; remedy?: string };
    expect(body.error).toContain('Failed to query Cost Explorer');
    expect(body.remedy).toContain('aws sso login');
  });
});
