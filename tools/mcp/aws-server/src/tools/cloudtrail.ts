import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';
import { errorResult } from '../aws-error.js';

// ---------------------------------------------------------------------------
// aws_cloudtrail_lookup
// ---------------------------------------------------------------------------

export interface CloudTrailLookupParams {
  instanceId?: string;
  eventName?: string;
  username?: string;
  startTime?: string;
  endTime?: string;
  mode?: 'events' | 'death-verdict';
}

interface RawCloudTrailEvent {
  EventId?: string;
  EventName?: string;
  EventTime?: string;
  Username?: string;
  Resources?: Array<{ ResourceName?: string; ResourceType?: string }>;
  CloudTrailEvent?: string;
}

interface CloudTrailLookupResponse {
  Events?: RawCloudTrailEvent[];
  NextToken?: string;
}

interface CloudTrailEventPayload {
  requestParameters?: {
    instancesSet?: {
      items?: Array<{ instanceId?: string }>;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface CompactEvent {
  eventTime: string;
  eventName: string;
  username: string | null;
  instanceIds: string[];
  terminationReason?: string | null;
}

const INSTANCE_ID_RE = /^i-[0-9a-f]{8,17}$/;
const SAFE_EVENT_NAME_RE = /^[A-Za-z0-9]+$/;
// No commas or whitespace: the value is embedded in the CLI's comma-separated
// `--lookup-attributes` shorthand.
const SAFE_USERNAME_RE = /^[A-Za-z0-9._@:/+=-]+$/;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/;

const MAX_EVENTS = 50;

/**
 * Syslog groups the runner CloudWatch agent ships to, one stream per instance
 * ID (terraform/runners/github-runners.tf). The spot-handler loop in
 * runner-userdata.sh writes `SPOT_NOTICE_PATTERN` there on a spot interruption
 * notice.
 */
const RUNNER_SYSLOG_GROUPS = [
  '/github-runners/legacy-sports-dev-runner/syslog',
  '/github-runners/legacy-sports-dev-runner-android/syslog',
];
// Unquoted terms (an AND match) — matches "[spot-handler] Spot interruption
// notice received".
const SPOT_NOTICE_PATTERN = 'Spot interruption notice';

interface SpotNotice {
  time: string;
  message: string;
}

/**
 * Look for a spot interruption notice in the instance's own syslog stream.
 *
 * CloudTrail alone cannot tell "scale-down" from "spot" when our scale-down
 * Lambda terminates an instance that already received its two-minute notice:
 * AWS never gets to evict it, so no BidEvictedEvent is recorded and the only
 * CloudTrail evidence is the Lambda's TerminateInstances (LS-10346).
 *
 * Returns `error` only when no group could be read, so a verdict reached
 * without this evidence is flagged rather than silently trusted.
 */
async function findSpotNotice(
  instanceId: string,
  startTime: string | undefined,
  endTime: string | undefined,
  cwd: string,
): Promise<{ notice: SpotNotice | null; error?: string }> {
  const results = await Promise.all(
    RUNNER_SYSLOG_GROUPS.map(async (group) => {
      // `--max-items`, not `--limit`: `--limit` stops after one service page,
      // which can legitimately come back empty while later pages match.
      const args = [
        'logs',
        'filter-log-events',
        '--log-group-name',
        group,
        '--log-stream-names',
        instanceId,
        '--filter-pattern',
        SPOT_NOTICE_PATTERN,
        '--max-items',
        '1',
        '--output',
        'json',
      ];
      const startMs = startTime ? Date.parse(startTime) : NaN;
      const endMs = endTime ? Date.parse(endTime) : NaN;
      if (!Number.isNaN(startMs)) args.push('--start-time', String(startMs));
      if (!Number.isNaN(endMs)) args.push('--end-time', String(endMs));
      try {
        const output = await runCommand('aws', args, cwd);
        const data = (output ? JSON.parse(output) : {}) as {
          events?: Array<{ timestamp?: number; message?: string }>;
        };
        const event = data.events?.[0];
        return {
          notice: event
            ? {
                time: new Date(event.timestamp ?? 0).toISOString(),
                message: (event.message ?? '').trim(),
              }
            : null,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  const found = results.find((r) => r.notice);
  if (found?.notice) return { notice: found.notice };
  if (results.every((r) => r.error !== undefined)) {
    return { notice: null, error: results[0]?.error };
  }
  return { notice: null };
}

function extractInstanceIds(event: RawCloudTrailEvent): string[] {
  const ids: string[] = [];

  for (const r of event.Resources ?? []) {
    if (r.ResourceName && INSTANCE_ID_RE.test(r.ResourceName)) {
      ids.push(r.ResourceName);
    }
  }

  if (ids.length === 0 && event.CloudTrailEvent) {
    try {
      const payload = JSON.parse(
        event.CloudTrailEvent,
      ) as CloudTrailEventPayload;
      const items = payload.requestParameters?.instancesSet?.items ?? [];
      for (const item of items) {
        if (item.instanceId && INSTANCE_ID_RE.test(item.instanceId)) {
          ids.push(item.instanceId);
        }
      }
    } catch {
      // unparseable CloudTrailEvent — skip
    }
  }

  return [...new Set(ids)];
}

function extractTerminationReason(event: RawCloudTrailEvent): string | null {
  if (event.EventName === 'BidEvictedEvent') return 'spot-eviction';
  const username = event.Username ?? '';
  if (/scale.?down/i.test(username)) return 'scale-down-terminate';
  if (event.EventName === 'TerminateInstances') return 'terminate-instances';
  return null;
}

function toCompactEvent(event: RawCloudTrailEvent): CompactEvent {
  return {
    eventTime: event.EventTime ?? '',
    eventName: event.EventName ?? '',
    username: event.Username ?? null,
    instanceIds: extractInstanceIds(event),
    terminationReason: extractTerminationReason(event),
  };
}

async function lookupByAttribute(
  attributeKey: 'ResourceName' | 'EventName' | 'Username',
  attributeValue: string,
  startTime: string | undefined,
  endTime: string | undefined,
  cwd: string,
): Promise<RawCloudTrailEvent[]> {
  const args = [
    'cloudtrail',
    'lookup-events',
    '--lookup-attributes',
    `AttributeKey=${attributeKey},AttributeValue=${attributeValue}`,
    '--output',
    'json',
    '--max-results',
    String(MAX_EVENTS),
  ];

  if (startTime) args.push('--start-time', startTime);
  if (endTime) args.push('--end-time', endTime);

  const output = await runCommand('aws', args, cwd);
  const data = JSON.parse(output) as CloudTrailLookupResponse;
  return data.Events ?? [];
}

export async function cloudTrailLookup(
  params: CloudTrailLookupParams,
): Promise<ToolResult> {
  const {
    instanceId,
    eventName,
    username,
    startTime,
    endTime,
    mode = 'events',
  } = params;

  if (!instanceId && !eventName && !username) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'At least one of instanceId or eventName or username must be provided.',
          }),
        },
      ],
      isError: true,
    };
  }

  if (username && !SAFE_USERNAME_RE.test(username)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Invalid username "${username}": must contain only alphanumerics and ._@:/+=- (no commas or spaces).`,
          }),
        },
      ],
      isError: true,
    };
  }

  if (instanceId && !INSTANCE_ID_RE.test(instanceId)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Invalid instanceId "${instanceId}": must match i-[0-9a-f]{8,17}.`,
          }),
        },
      ],
      isError: true,
    };
  }

  if (eventName && !SAFE_EVENT_NAME_RE.test(eventName)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Invalid eventName "${eventName}": must contain only alphanumeric characters.`,
          }),
        },
      ],
      isError: true,
    };
  }

  if (startTime && !ISO_TIMESTAMP_RE.test(startTime)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Invalid startTime "${startTime}": must be an ISO 8601 timestamp (e.g. 2024-01-15T12:00:00Z).`,
          }),
        },
      ],
      isError: true,
    };
  }

  if (endTime && !ISO_TIMESTAMP_RE.test(endTime)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Invalid endTime "${endTime}": must be an ISO 8601 timestamp (e.g. 2024-01-15T13:00:00Z).`,
          }),
        },
      ],
      isError: true,
    };
  }

  if (mode === 'death-verdict' && !instanceId) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: 'mode "death-verdict" requires instanceId.',
          }),
        },
      ],
      isError: true,
    };
  }

  const cwd = getRepoRoot();

  try {
    if (mode === 'death-verdict') {
      // Guarded above, but narrows `instanceId` from `string | undefined` to
      // `string` for TypeScript within this block.
      if (!instanceId) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                error: 'mode "death-verdict" requires instanceId.',
              }),
            },
          ],
          isError: true,
        };
      }

      // Three parallel lookups: CloudTrail by ResourceName (catches
      // TerminateInstances), CloudTrail by EventName=BidEvictedEvent (spot
      // evictions have empty ResourceName), and the instance's syslog stream
      // for a spot interruption notice (see findSpotNotice).
      const [byResourceEvents, bidEvictedEvents, spotNotice] =
        await Promise.all([
          lookupByAttribute(
            'ResourceName',
            instanceId,
            startTime,
            endTime,
            cwd,
          ),
          lookupByAttribute(
            'EventName',
            'BidEvictedEvent',
            startTime,
            endTime,
            cwd,
          ),
          findSpotNotice(instanceId, startTime, endTime, cwd),
        ]);

      // Filter BidEvictedEvents to those mentioning this instanceId in the payload.
      const relevantBidEvicted = bidEvictedEvents.filter((e) =>
        extractInstanceIds(e).includes(instanceId),
      );

      const terminationEvents = byResourceEvents.filter(
        (e) =>
          e.EventName === 'TerminateInstances' ||
          e.EventName === 'BidEvictedEvent',
      );

      const allRelevant = [...relevantBidEvicted, ...terminationEvents].slice(
        0,
        MAX_EVENTS,
      );

      // Every signal that fired is reported, so a spot-reclaimed instance that
      // our scale-down Lambda happened to terminate first shows both.
      const scaleDownTerminate = terminationEvents.some(
        (e) =>
          e.EventName === 'TerminateInstances' &&
          /scale.?down/i.test(e.Username ?? ''),
      );
      const manualTerminate = terminationEvents.some(
        (e) =>
          e.EventName === 'TerminateInstances' &&
          !/scale.?down/i.test(e.Username ?? ''),
      );
      const signals = [
        ...(relevantBidEvicted.length > 0 ? ['bid-evicted'] : []),
        ...(spotNotice.notice ? ['spot-interruption-notice'] : []),
        ...(scaleDownTerminate ? ['scale-down-terminate'] : []),
        ...(manualTerminate ? ['manual-terminate'] : []),
      ];

      // Determine verdict: prefer spot (BidEvictedEvent or an interruption
      // notice) > scale-down > manual > unknown.
      let verdict: 'spot' | 'scale-down' | 'manual' | 'unknown' = 'unknown';
      if (relevantBidEvicted.length > 0 || spotNotice.notice) {
        verdict = 'spot';
      } else if (scaleDownTerminate) {
        verdict = 'scale-down';
      } else if (terminationEvents.length > 0) {
        verdict = 'manual';
      }

      return {
        content: [
          {
            type: 'text',
            text: minifiedJson({
              ok: true,
              instanceId,
              verdict,
              signals,
              ...(spotNotice.notice ? { spotNotice: spotNotice.notice } : {}),
              // The syslog check could not run, so a non-spot verdict has not
              // ruled out a spot interruption.
              ...(spotNotice.error
                ? { spotNoticeCheckError: spotNotice.error }
                : {}),
              events: allRelevant.map(toCompactEvent),
            }),
          },
        ],
      };
    }

    // events mode
    let rawEvents: RawCloudTrailEvent[];

    if (username) {
      // CloudTrail accepts one lookup attribute per call, so eventName and
      // instanceId narrow the Username result client-side.
      rawEvents = await lookupByAttribute(
        'Username',
        username,
        startTime,
        endTime,
        cwd,
      );
      if (eventName) {
        rawEvents = rawEvents.filter((e) => e.EventName === eventName);
      }
      if (instanceId) {
        rawEvents = rawEvents.filter((e) =>
          extractInstanceIds(e).includes(instanceId),
        );
      }
    } else if (eventName) {
      rawEvents = await lookupByAttribute(
        'EventName',
        eventName,
        startTime,
        endTime,
        cwd,
      );
      // If instanceId also given, filter by presence in Resources or CloudTrailEvent payload.
      if (instanceId) {
        rawEvents = rawEvents.filter((e) =>
          extractInstanceIds(e).includes(instanceId),
        );
      }
    } else if (instanceId) {
      // instanceId only: look up by ResourceName.
      rawEvents = await lookupByAttribute(
        'ResourceName',
        instanceId,
        startTime,
        endTime,
        cwd,
      );
    } else {
      // Unreachable: guarded by the instanceId-or-eventName check above.
      rawEvents = [];
    }

    const events = rawEvents.slice(0, MAX_EVENTS).map(toCompactEvent);

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            ok: true,
            count: events.length,
            events,
          }),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult('Failed to look up CloudTrail events', message);
  }
}
