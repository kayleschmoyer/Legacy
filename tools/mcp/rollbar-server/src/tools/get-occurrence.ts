import { rollbarGet } from '../rollbar-api.js';
import type { ToolResult } from '../types.js';
import { minifiedJson } from '@legacy-sports/mcp-format';

/** Sections of `data` that {@link GetOccurrenceParams.include} can select. */
export type OccurrenceSection =
  | 'trace'
  | 'telemetry'
  | 'custom'
  | 'request'
  | 'client';

const ALL_SECTIONS: readonly OccurrenceSection[] = [
  'trace',
  'telemetry',
  'custom',
  'request',
  'client',
];

/**
 * Default section set when `include` is omitted: everything except
 * `telemetry` (the breadcrumb array), which was the bulk of both oversized
 * payloads that motivated these params (LS-9926) and is rarely needed for
 * an initial triage pass.
 */
const DEFAULT_SECTIONS: readonly OccurrenceSection[] = ALL_SECTIONS.filter(
  (section) => section !== 'telemetry',
);

export interface GetOccurrenceParams {
  /** Internal item ID — fetches the most recent occurrence of this item. */
  itemId?: number;
  /**
   * Specific occurrence (instance) ID — fetches that exact occurrence.
   *
   * Known limitation (LS-9808): `/instance/{id}` reliably resolves only an
   * item's most recent occurrence — older-but-in-retention ids commonly
   * fail with "instance not found"; see the caught-error hint below.
   */
  occurrenceId?: number;
  /**
   * Cap `data.body.trace.frames` / `data.body.trace_chain[].frames` to the
   * innermost + outermost N frames combined (matching how a human reads a
   * stack trace); the elided middle is replaced with a single
   * `{ elided_frames: <count> }` marker. Omit to return every frame.
   */
  maxFrames?: number;
  /**
   * Restrict which `data` sections are returned. Omit to use the default
   * (everything except `telemetry`).
   */
  include?: OccurrenceSection[];
}

interface OccurrenceResult {
  /**
   * Some Rollbar responses nest the instance under `result.instance`; others
   * return the instance object directly as `result` (see the unwrap below).
   */
  instance?: Record<string, unknown>;
}

interface InstancesResult {
  instances: Array<Record<string, unknown>>;
}

/** Narrow an unknown value to a non-null, non-array plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Cap a frames array to the innermost + outermost `maxFrames` combined,
 * matching how a human reads a stack trace (top of the call stack + entry
 * point). Replaces the elided middle with a single marker object so the
 * frame count is still visible. No-op when the array already fits.
 */
function capFrames(frames: unknown[], maxFrames: number): unknown[] {
  if (frames.length <= maxFrames) return frames;
  const head = Math.ceil(maxFrames / 2);
  const tail = Math.floor(maxFrames / 2);
  const elided = frames.length - head - tail;
  return [
    ...frames.slice(0, head),
    { elided_frames: elided },
    ...frames.slice(frames.length - tail),
  ];
}

/**
 * Apply `maxFrames` capping and `include` section filtering to a raw
 * occurrence payload. Returns a shallow-copied object — the input is not
 * mutated.
 */
function filterOccurrence(
  occurrence: Record<string, unknown>,
  { maxFrames, include }: Pick<GetOccurrenceParams, 'maxFrames' | 'include'>,
): Record<string, unknown> {
  if (!isRecord(occurrence.data)) return occurrence;

  const sections = new Set<OccurrenceSection>(
    include && include.length > 0 ? include : DEFAULT_SECTIONS,
  );
  const data = { ...occurrence.data };

  if (!sections.has('custom')) delete data.custom;
  if (!sections.has('request')) delete data.request;
  if (!sections.has('client')) delete data.client;

  if (isRecord(data.body)) {
    const body = { ...data.body };

    if (!sections.has('telemetry')) delete body.telemetry;

    if (!sections.has('trace')) {
      delete body.trace;
      delete body.trace_chain;
    } else if (maxFrames !== undefined) {
      if (isRecord(body.trace) && Array.isArray(body.trace.frames)) {
        body.trace = {
          ...body.trace,
          frames: capFrames(body.trace.frames, maxFrames),
        };
      }
      if (Array.isArray(body.trace_chain)) {
        body.trace_chain = body.trace_chain.map((entry) =>
          isRecord(entry) && Array.isArray(entry.frames)
            ? { ...entry, frames: capFrames(entry.frames, maxFrames) }
            : entry,
        );
      }
    }

    data.body = body;
  }

  return { ...occurrence, data };
}

/**
 * Fetch the payload of a Rollbar occurrence (instance) so agents can inspect
 * `data.body` — trace_chain, message, custom, logArgs — and related `data`
 * context. By default returns everything except `telemetry` (the breadcrumb
 * array, usually the bulk of the payload); pass `include` to opt back in, or
 * narrow further. Pass `maxFrames` to cap deep stack traces (common on React
 * Native crashes) to their innermost + outermost frames. Accepts either an
 * `occurrenceId` (direct lookup via `/instance/{id}`) or an `itemId`
 * (fetches the most recent occurrence of that item via
 * `/item/{itemId}/instances?per_page=1`).
 */
export async function getOccurrence(
  params: GetOccurrenceParams,
): Promise<ToolResult> {
  const { itemId, occurrenceId, maxFrames, include } = params;

  if (occurrenceId === undefined && itemId === undefined) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Provide either `occurrenceId` (specific occurrence) or `itemId` (latest occurrence of that item).',
        },
      ],
    };
  }

  try {
    let occurrence: unknown;

    if (occurrenceId !== undefined) {
      const result = await rollbarGet<
        OccurrenceResult & Record<string, unknown>
      >({ path: `/instance/${occurrenceId}` });
      // `/instance/{id}` returns the instance object directly as the envelope
      // `result` (same convention as `/item/{id}`); some responses instead nest
      // it under `result.instance`. Accept either shape. If `occurrence` were
      // left undefined it would serialize to `undefined` (not a string) below
      // and fail MCP content-schema validation with a Zod invalid_union error.
      occurrence =
        isRecord(result) && isRecord(result.instance)
          ? result.instance
          : result;
    } else {
      const result = await rollbarGet<InstancesResult>({
        path: `/item/${itemId}/instances`,
        query: { per_page: 1 },
      });
      const instances = result.instances ?? [];
      if (instances.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No occurrences found for item ${itemId}.`,
            },
          ],
        };
      }
      occurrence = instances[0];
    }

    if (!isRecord(occurrence)) {
      const label =
        occurrenceId !== undefined
          ? `occurrence ${occurrenceId}`
          : `latest occurrence of item ${itemId}`;
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Rollbar returned no usable payload for ${label}.`,
          },
        ],
      };
    }

    const filtered = filterOccurrence(occurrence, { maxFrames, include });

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson(filtered),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const label =
      occurrenceId !== undefined
        ? `occurrence ${occurrenceId}`
        : `latest occurrence of item ${itemId}`;
    // Known limitation (LS-9808): the Rollbar `/instance/{id}` endpoint
    // reliably resolves only an item's most recent occurrence — ids for
    // older-but-within-retention occurrences returned by
    // rollbar_list_occurrences commonly 400 with "instance not found" even
    // though they are not stale/expired. Surface this so the caller doesn't
    // burn turns retrying ids that will never resolve.
    const knownLimitationHint =
      occurrenceId !== undefined && /instance not found/i.test(message)
        ? ' This id came back "instance not found", which is a known Rollbar API limitation (LS-9808): `/instance/{id}` reliably resolves only an item\'s most recent occurrence, even for ids that are well within the item\'s retention window. For historical occurrences, use the summary rollbar_list_occurrences already returned for this id instead of retrying.'
        : '';
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to fetch ${label}: ${message}${knownLimitationHint}`,
        },
      ],
    };
  }
}
