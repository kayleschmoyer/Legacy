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
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/;

const MAX_EVENTS = 50;

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
  attributeKey: 'ResourceName' | 'EventName',
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
  const { instanceId, eventName, startTime, endTime, mode = 'events' } = params;

  if (!instanceId && !eventName) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: 'At least one of instanceId or eventName must be provided.',
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
      // Run two parallel lookups: one by ResourceName (catches TerminateInstances)
      // and one by EventName=BidEvictedEvent (spot evictions have empty ResourceName).
      const [byResourceEvents, bidEvictedEvents] = await Promise.all([
        lookupByAttribute('ResourceName', instanceId!, startTime, endTime, cwd),
        lookupByAttribute(
          'EventName',
          'BidEvictedEvent',
          startTime,
          endTime,
          cwd,
        ),
      ]);

      // Filter BidEvictedEvents to those mentioning this instanceId in the payload.
      const relevantBidEvicted = bidEvictedEvents.filter((e) =>
        extractInstanceIds(e).includes(instanceId!),
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

      // Determine verdict: prefer BidEvictedEvent (spot) > scale-down > manual > unknown.
      let verdict: 'spot' | 'scale-down' | 'manual' | 'unknown' = 'unknown';
      if (relevantBidEvicted.length > 0) {
        verdict = 'spot';
      } else if (
        terminationEvents.some((e) => /scale.?down/i.test(e.Username ?? ''))
      ) {
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
              events: allRelevant.map(toCompactEvent),
            }),
          },
        ],
      };
    }

    // events mode
    let rawEvents: RawCloudTrailEvent[];

    if (eventName) {
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
    } else {
      // instanceId only: look up by ResourceName.
      rawEvents = await lookupByAttribute(
        'ResourceName',
        instanceId!,
        startTime,
        endTime,
        cwd,
      );
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
