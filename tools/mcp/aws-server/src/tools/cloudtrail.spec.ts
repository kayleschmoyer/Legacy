jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import { cloudTrailLookup } from './cloudtrail.js';
import { runCommand } from '../run-command.js';

const mockedRun = runCommand as jest.MockedFunction<typeof runCommand>;

function text(result: Awaited<ReturnType<typeof cloudTrailLookup>>): string {
  const block = result.content[0];
  if (!block || block.type !== 'text') throw new Error('Expected text block');
  return block.text;
}

function parsed(
  result: Awaited<ReturnType<typeof cloudTrailLookup>>,
): Record<string, unknown> {
  return JSON.parse(text(result)) as Record<string, unknown>;
}

const TERMINATE_EVENT = {
  EventId: 'evt-1',
  EventName: 'TerminateInstances',
  EventTime: '2024-01-15T12:00:00Z',
  Username: 'legacy-sports-dev-runner-scale-down',
  Resources: [
    { ResourceName: 'i-0abc1234def56789a', ResourceType: 'AWS::EC2::Instance' },
  ],
  CloudTrailEvent: JSON.stringify({ requestParameters: {} }),
};

const BID_EVICTED_EVENT = {
  EventId: 'evt-2',
  EventName: 'BidEvictedEvent',
  EventTime: '2024-01-15T11:30:00Z',
  Username: 'AWS Internal',
  Resources: [],
  CloudTrailEvent: JSON.stringify({
    requestParameters: {
      instancesSet: { items: [{ instanceId: 'i-0abc1234def56789a' }] },
    },
  }),
};

beforeEach(() => {
  mockedRun.mockReset();
});

describe('cloudTrailLookup — validation', () => {
  it('rejects when neither instanceId nor eventName provided', async () => {
    const result = await cloudTrailLookup({});
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('At least one of instanceId or eventName');
  });

  it('rejects an invalid instanceId format', async () => {
    const result = await cloudTrailLookup({ instanceId: 'not-an-instance-id' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Invalid instanceId');
  });

  it('rejects an eventName with non-alphanumeric characters', async () => {
    const result = await cloudTrailLookup({ eventName: 'Terminate;echo foo' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Invalid eventName');
  });

  it('rejects an invalid startTime', async () => {
    const result = await cloudTrailLookup({
      instanceId: 'i-0abc1234def56789a',
      startTime: 'not-a-timestamp',
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Invalid startTime');
  });

  it('rejects death-verdict mode without instanceId', async () => {
    const result = await cloudTrailLookup({
      eventName: 'TerminateInstances',
      mode: 'death-verdict',
    });
    expect(result.isError).toBe(true);
    const p = parsed(result) as { error: string };
    expect(p.error).toContain('mode "death-verdict" requires instanceId');
  });
});

describe('cloudTrailLookup — events mode', () => {
  it('queries by ResourceName when only instanceId is provided', async () => {
    mockedRun.mockResolvedValue(JSON.stringify({ Events: [TERMINATE_EVENT] }));
    const result = await cloudTrailLookup({
      instanceId: 'i-0abc1234def56789a',
    });
    const data = parsed(result);
    expect(data.ok).toBe(true);
    expect(data.count).toBe(1);
    const events = data.events as Array<Record<string, unknown>>;
    expect(events[0].eventName).toBe('TerminateInstances');
    expect(events[0].eventTime).toBe('2024-01-15T12:00:00Z');
    // TERMINATE_EVENT has a scale-down username so reason is scale-down-terminate
    expect(events[0].terminationReason).toBe('scale-down-terminate');

    const callArgs = mockedRun.mock.calls[0][1];
    expect(callArgs).toContain(
      'AttributeKey=ResourceName,AttributeValue=i-0abc1234def56789a',
    );
  });

  it('queries by EventName when only eventName is provided', async () => {
    mockedRun.mockResolvedValue(JSON.stringify({ Events: [TERMINATE_EVENT] }));
    const result = await cloudTrailLookup({ eventName: 'TerminateInstances' });
    expect(parsed(result).ok).toBe(true);

    const callArgs = mockedRun.mock.calls[0][1];
    expect(callArgs).toContain(
      'AttributeKey=EventName,AttributeValue=TerminateInstances',
    );
  });

  it('filters by instanceId client-side when both instanceId and eventName provided', async () => {
    mockedRun.mockResolvedValue(
      JSON.stringify({
        Events: [
          TERMINATE_EVENT,
          {
            ...TERMINATE_EVENT,
            Resources: [{ ResourceName: 'i-0other000000000a' }],
          },
        ],
      }),
    );
    const result = await cloudTrailLookup({
      instanceId: 'i-0abc1234def56789a',
      eventName: 'TerminateInstances',
    });
    const data = parsed(result);
    expect(data.count).toBe(1);
  });

  it('returns terminationReason=spot-eviction for BidEvictedEvent', async () => {
    mockedRun.mockResolvedValue(
      JSON.stringify({ Events: [BID_EVICTED_EVENT] }),
    );
    const result = await cloudTrailLookup({ eventName: 'BidEvictedEvent' });
    const events = parsed(result).events as Array<Record<string, unknown>>;
    expect(events[0].terminationReason).toBe('spot-eviction');
  });

  it('extracts instanceId from CloudTrailEvent payload for BidEvictedEvent', async () => {
    mockedRun.mockResolvedValue(
      JSON.stringify({ Events: [BID_EVICTED_EVENT] }),
    );
    const result = await cloudTrailLookup({ eventName: 'BidEvictedEvent' });
    const events = parsed(result).events as Array<Record<string, unknown>>;
    expect(events[0].instanceIds).toEqual(['i-0abc1234def56789a']);
  });

  it('returns compact response with no extra fields', async () => {
    mockedRun.mockResolvedValue(JSON.stringify({ Events: [TERMINATE_EVENT] }));
    const result = await cloudTrailLookup({
      instanceId: 'i-0abc1234def56789a',
    });
    const events = parsed(result).events as Array<Record<string, unknown>>;
    const keys = Object.keys(events[0]);
    expect(keys).toEqual(
      expect.arrayContaining([
        'eventTime',
        'eventName',
        'username',
        'instanceIds',
        'terminationReason',
      ]),
    );
    // No raw CloudTrailEvent JSON blob in output.
    expect(text(result)).not.toContain('requestParameters');
  });
});

describe('cloudTrailLookup — death-verdict mode', () => {
  it('returns verdict=scale-down when TerminateInstances from scale-down user', async () => {
    mockedRun
      .mockResolvedValueOnce(JSON.stringify({ Events: [TERMINATE_EVENT] })) // ResourceName lookup
      .mockResolvedValueOnce(JSON.stringify({ Events: [] })); // BidEvictedEvent lookup

    const result = await cloudTrailLookup({
      instanceId: 'i-0abc1234def56789a',
      mode: 'death-verdict',
    });
    const data = parsed(result);
    expect(data.ok).toBe(true);
    expect(data.verdict).toBe('scale-down');
    expect(data.instanceId).toBe('i-0abc1234def56789a');
  });

  it('returns verdict=spot when BidEvictedEvent matches the instanceId', async () => {
    mockedRun
      .mockResolvedValueOnce(JSON.stringify({ Events: [] })) // ResourceName lookup
      .mockResolvedValueOnce(JSON.stringify({ Events: [BID_EVICTED_EVENT] })); // BidEvictedEvent lookup

    const result = await cloudTrailLookup({
      instanceId: 'i-0abc1234def56789a',
      mode: 'death-verdict',
    });
    expect(parsed(result).verdict).toBe('spot');
  });

  it('returns verdict=manual when TerminateInstances from a non-scale-down user', async () => {
    const manualEvent = {
      ...TERMINATE_EVENT,
      Username: 'arn:aws:iam::123456789012:user/john.doe',
    };
    mockedRun
      .mockResolvedValueOnce(JSON.stringify({ Events: [manualEvent] }))
      .mockResolvedValueOnce(JSON.stringify({ Events: [] }));

    const result = await cloudTrailLookup({
      instanceId: 'i-0abc1234def56789a',
      mode: 'death-verdict',
    });
    expect(parsed(result).verdict).toBe('manual');
  });

  it('returns verdict=unknown when no matching events found', async () => {
    mockedRun
      .mockResolvedValueOnce(JSON.stringify({ Events: [] }))
      .mockResolvedValueOnce(JSON.stringify({ Events: [] }));

    const result = await cloudTrailLookup({
      instanceId: 'i-0abc1234def56789a',
      mode: 'death-verdict',
    });
    expect(parsed(result).verdict).toBe('unknown');
  });

  it('prefers spot over scale-down when both BidEvicted and TerminateInstances match', async () => {
    mockedRun
      .mockResolvedValueOnce(JSON.stringify({ Events: [TERMINATE_EVENT] }))
      .mockResolvedValueOnce(JSON.stringify({ Events: [BID_EVICTED_EVENT] }));

    const result = await cloudTrailLookup({
      instanceId: 'i-0abc1234def56789a',
      mode: 'death-verdict',
    });
    expect(parsed(result).verdict).toBe('spot');
  });

  it('runs exactly two parallel lookups (ResourceName + BidEvictedEvent)', async () => {
    mockedRun
      .mockResolvedValueOnce(JSON.stringify({ Events: [] }))
      .mockResolvedValueOnce(JSON.stringify({ Events: [] }));

    await cloudTrailLookup({
      instanceId: 'i-0abc1234def56789a',
      mode: 'death-verdict',
    });
    expect(mockedRun).toHaveBeenCalledTimes(2);
    const lookupArgs = mockedRun.mock.calls.map((c) => c[1].join(' '));
    expect(lookupArgs.some((a) => a.includes('ResourceName'))).toBe(true);
    expect(lookupArgs.some((a) => a.includes('BidEvictedEvent'))).toBe(true);
  });

  it('does not include BidEvictedEvents for a different instance in verdict', async () => {
    const unrelatedBidEvicted = {
      ...BID_EVICTED_EVENT,
      CloudTrailEvent: JSON.stringify({
        requestParameters: {
          instancesSet: { items: [{ instanceId: 'i-0other000000000a' }] },
        },
      }),
    };
    mockedRun
      .mockResolvedValueOnce(JSON.stringify({ Events: [] }))
      .mockResolvedValueOnce(JSON.stringify({ Events: [unrelatedBidEvicted] }));

    const result = await cloudTrailLookup({
      instanceId: 'i-0abc1234def56789a',
      mode: 'death-verdict',
    });
    expect(parsed(result).verdict).toBe('unknown');
  });
});
