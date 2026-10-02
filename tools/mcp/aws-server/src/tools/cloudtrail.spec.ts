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

  it('queries by Username when username is provided', async () => {
    mockedRun.mockResolvedValue(JSON.stringify({ Events: [TERMINATE_EVENT] }));
    const result = await cloudTrailLookup({
      username: 'legacy-sports-dev-runner-scale-down',
    });
    expect(parsed(result).count).toBe(1);
    expect(mockedRun).toHaveBeenCalledTimes(1);
    expect(mockedRun.mock.calls[0][1]).toContain(
      'AttributeKey=Username,AttributeValue=legacy-sports-dev-runner-scale-down',
    );
  });

  it('filters a Username lookup client-side by eventName and instanceId', async () => {
    mockedRun.mockResolvedValue(
      JSON.stringify({
        Events: [
          TERMINATE_EVENT,
          { ...TERMINATE_EVENT, EventName: 'DescribeInstances' },
          {
            ...TERMINATE_EVENT,
            Resources: [{ ResourceName: 'i-0other000000000a' }],
          },
        ],
      }),
    );
    const result = await cloudTrailLookup({
      username: 'legacy-sports-dev-runner-scale-down',
      eventName: 'TerminateInstances',
      instanceId: 'i-0abc1234def56789a',
    });
    expect(parsed(result).count).toBe(1);
    expect(mockedRun.mock.calls[0][1].join(' ')).toContain(
      'AttributeKey=Username',
    );
  });

  it('rejects a username that would break the lookup-attributes shorthand', async () => {
    const result = await cloudTrailLookup({ username: 'a,AttributeKey=x' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Invalid username');
    expect(mockedRun).not.toHaveBeenCalled();
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

  it('runs the two CloudTrail lookups plus one syslog check per runner group', async () => {
    mockedRun
      .mockResolvedValueOnce(JSON.stringify({ Events: [] }))
      .mockResolvedValueOnce(JSON.stringify({ Events: [] }));

    await cloudTrailLookup({
      instanceId: 'i-0abc1234def56789a',
      mode: 'death-verdict',
    });
    expect(mockedRun).toHaveBeenCalledTimes(4);
    const lookupArgs = mockedRun.mock.calls.map((c) => c[1].join(' '));
    expect(lookupArgs.some((a) => a.includes('ResourceName'))).toBe(true);
    expect(lookupArgs.some((a) => a.includes('BidEvictedEvent'))).toBe(true);
    expect(
      lookupArgs.filter((a) => a.includes('filter-log-events')),
    ).toHaveLength(2);
  });

  describe('spot interruption notice (LS-10346)', () => {
    const SPOT_NOTICE_LOG = JSON.stringify({
      events: [
        {
          timestamp: Date.parse('2024-01-15T11:58:54Z'),
          message:
            'Jan 15 11:58:54 ip-10-0-1-27 user-data: [spot-handler] Spot interruption notice received — sending SIGTERM to runner\n',
        },
      ],
    });

    /** Route by command so the mock does not depend on Promise.all ordering. */
    function mockLookups(opts: {
      byResource?: object[];
      bidEvicted?: object[];
      syslog?: (group: string) => string | Error;
    }): void {
      mockedRun.mockImplementation((_cmd, args) => {
        if (args.includes('filter-log-events')) {
          const group = args[args.indexOf('--log-group-name') + 1];
          const out = opts.syslog?.(group) ?? JSON.stringify({ events: [] });
          return out instanceof Error
            ? Promise.reject(out)
            : Promise.resolve(out);
        }
        const isBidEvicted = args.some((a) => a.includes('BidEvictedEvent'));
        return Promise.resolve(
          JSON.stringify({
            Events: isBidEvicted
              ? (opts.bidEvicted ?? [])
              : (opts.byResource ?? []),
          }),
        );
      });
    }

    it('returns verdict=spot with both signals when scale-down terminated an instance that already had its notice', async () => {
      mockLookups({
        byResource: [TERMINATE_EVENT],
        syslog: (group) =>
          group.endsWith('-runner/syslog')
            ? SPOT_NOTICE_LOG
            : JSON.stringify({ events: [] }),
      });

      const data = parsed(
        await cloudTrailLookup({
          instanceId: 'i-0abc1234def56789a',
          mode: 'death-verdict',
        }),
      );
      expect(data.verdict).toBe('spot');
      expect(data.signals).toEqual([
        'spot-interruption-notice',
        'scale-down-terminate',
      ]);
      const spotNotice = data.spotNotice as { time: string; message: string };
      expect(spotNotice.time).toBe('2024-01-15T11:58:54.000Z');
      expect(spotNotice.message).toContain('Spot interruption notice received');
      // The TerminateInstances event is still reported alongside the notice.
      expect(data.events).toHaveLength(1);
    });

    it('still returns verdict=scale-down when the syslog has no notice', async () => {
      mockLookups({ byResource: [TERMINATE_EVENT] });

      const data = parsed(
        await cloudTrailLookup({
          instanceId: 'i-0abc1234def56789a',
          mode: 'death-verdict',
        }),
      );
      expect(data.verdict).toBe('scale-down');
      expect(data.signals).toEqual(['scale-down-terminate']);
      expect(data.spotNotice).toBeUndefined();
      expect(data.spotNoticeCheckError).toBeUndefined();
    });

    it('scopes the syslog search to the instance stream and a leading-slash group', async () => {
      mockLookups({});

      await cloudTrailLookup({
        instanceId: 'i-0abc1234def56789a',
        mode: 'death-verdict',
        startTime: '2024-01-15T11:00:00Z',
      });
      const logCalls = mockedRun.mock.calls
        .map((c) => c[1])
        .filter((a) => a.includes('filter-log-events'));
      for (const args of logCalls) {
        expect(args[args.indexOf('--log-group-name') + 1]).toMatch(
          /^\/github-runners\/legacy-sports-dev-runner(-android)?\/syslog$/,
        );
        expect(args[args.indexOf('--log-stream-names') + 1]).toBe(
          'i-0abc1234def56789a',
        );
        expect(args[args.indexOf('--start-time') + 1]).toBe(
          String(Date.parse('2024-01-15T11:00:00Z')),
        );
      }
    });

    it('flags an unverified verdict when no syslog group could be read', async () => {
      mockLookups({
        byResource: [TERMINATE_EVENT],
        syslog: () => new Error('AccessDeniedException'),
      });

      const data = parsed(
        await cloudTrailLookup({
          instanceId: 'i-0abc1234def56789a',
          mode: 'death-verdict',
        }),
      );
      expect(data.verdict).toBe('scale-down');
      expect(data.spotNoticeCheckError).toContain('AccessDeniedException');
    });

    it('does not flag an error when only one syslog group is unreadable', async () => {
      mockLookups({
        byResource: [TERMINATE_EVENT],
        syslog: (group) =>
          group.includes('android')
            ? new Error('ResourceNotFoundException')
            : JSON.stringify({ events: [] }),
      });

      const data = parsed(
        await cloudTrailLookup({
          instanceId: 'i-0abc1234def56789a',
          mode: 'death-verdict',
        }),
      );
      expect(data.spotNoticeCheckError).toBeUndefined();
    });
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
