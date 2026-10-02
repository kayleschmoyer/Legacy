import { markdownTable } from '@legacy-sports/mcp-format';
import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';
import { errorResult } from '../aws-error.js';

// ---------------------------------------------------------------------------
// aws_cost_explorer
// ---------------------------------------------------------------------------

export const COST_GROUP_BY = [
  'service',
  'usage_type',
  'instance_type',
  'region',
  'tag',
] as const;
export type CostGroupBy = (typeof COST_GROUP_BY)[number];

export const COST_METRICS = ['UnblendedCost', 'UsageQuantity'] as const;
export type CostMetric = (typeof COST_METRICS)[number];

export interface CostExplorerParams {
  start: string;
  end: string;
  granularity?: 'daily' | 'monthly';
  groupBy?: CostGroupBy;
  tagKey?: string;
  service?: string;
  metrics?: CostMetric[];
  compareWith?: 'previousPeriod';
  includeExcluded?: boolean;
  limit?: number;
}

interface CeMetricValue {
  Amount?: string;
  Unit?: string;
}

interface CeGroup {
  Keys?: string[];
  Metrics?: Record<string, CeMetricValue | undefined>;
}

interface CeResultByTime {
  TimePeriod?: { Start?: string; End?: string };
  Groups?: CeGroup[];
}

interface CeResponse {
  ResultsByTime?: CeResultByTime[];
  NextPageToken?: string;
}

interface CeTagListResponse {
  CostAllocationTags?: Array<{ TagKey?: string; Status?: string }>;
}

interface GroupTotal {
  cost: number;
  usage: number;
}

interface PeriodTotals {
  byKey: Map<string, GroupTotal>;
  byTime: Map<string, number>;
  total: number;
}

/** Tag that opts a resource out of project cost reports (LS-10340). */
export const EXCLUDE_TAG_KEY = 'CostReportExclude';
/**
 * Region excluded while {@link EXCLUDE_TAG_KEY} is not an active cost
 * allocation tag (Cost Explorer cannot filter on an inactive tag). The project
 * runs in us-east-1; the only us-east-2 spend is the personal resource the tag
 * marks (LS-10340).
 */
export const EXCLUDE_FALLBACK_REGION = 'us-east-2';

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
/** Backstop against a runaway NextPageToken loop. */
const MAX_PAGES = 20;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TAG_KEY_RE = /^[A-Za-z0-9 _.:/=+@-]{1,128}$/;
const SERVICE_RE = /^[A-Za-z0-9 ()_.,&/-]{1,128}$/;
const DAY_MS = 86_400_000;

const DIMENSION_KEYS: Record<Exclude<CostGroupBy, 'tag'>, string> = {
  service: 'SERVICE',
  usage_type: 'USAGE_TYPE',
  instance_type: 'INSTANCE_TYPE',
  region: 'REGION',
};

/** `service: "ec2"` covers both Cost Explorer service names EC2 bills under. */
const SERVICE_ALIASES: Record<string, string[]> = {
  ec2: ['Amazon Elastic Compute Cloud - Compute', 'EC2 - Other'],
};

export type Ec2Bucket =
  | 'spot'
  | 'on-demand'
  | 'egress'
  | 'EBS'
  | 'snapshot'
  | 'NAT'
  | 'other';

/**
 * Classify a Cost Explorer USAGE_TYPE (optionally region-prefixed, e.g.
 * `USE2-SpotUsage:c7i.2xlarge`) into the EC2 cost buckets a runner-cost
 * investigation reads. Snapshot is checked before EBS because snapshot usage
 * types are `EBS:SnapshotUsage`.
 */
export function ec2Bucket(usageType: string): Ec2Bucket {
  if (/SpotUsage/.test(usageType)) return 'spot';
  if (/(Box|Dedicated)Usage/.test(usageType)) return 'on-demand';
  if (/DataTransfer-Out-Bytes/.test(usageType)) return 'egress';
  if (/SnapshotUsage/.test(usageType)) return 'snapshot';
  if (/EBS:/.test(usageType)) return 'EBS';
  if (/NatGateway/.test(usageType)) return 'NAT';
  return 'other';
}

function validationError(error: string): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ ok: false, error }) }],
    isError: true,
  };
}

function parseDate(value: string): Date | null {
  if (!DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject overflow dates (2026-02-31) that Date silently rolls forward.
  return formatDate(date) === value ? date : null;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The window immediately before [start, end). A window aligned to whole
 * calendar months shifts by that many months, so September compares with
 * August rather than with the 30 days before 1 September; anything else shifts
 * by its own length in days.
 */
export function previousPeriod(
  start: string,
  end: string,
): { start: string; end: string } {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (s.getUTCDate() === 1 && e.getUTCDate() === 1) {
    const months =
      (e.getUTCFullYear() - s.getUTCFullYear()) * 12 +
      (e.getUTCMonth() - s.getUTCMonth());
    const prev = new Date(
      Date.UTC(s.getUTCFullYear(), s.getUTCMonth() - months, 1),
    );
    return { start: formatDate(prev), end: start };
  }
  const prev = new Date(s.getTime() - (e.getTime() - s.getTime()));
  return { start: formatDate(prev), end: start };
}

/** True when CostReportExclude is an active cost allocation tag. */
async function isExcludeTagActive(cwd: string): Promise<boolean> {
  try {
    const output = await runCommand(
      'aws',
      [
        'ce',
        'list-cost-allocation-tags',
        '--tag-keys',
        EXCLUDE_TAG_KEY,
        '--status',
        'Active',
        '--output',
        'json',
      ],
      cwd,
    );
    const data = JSON.parse(output) as CeTagListResponse;
    return (data.CostAllocationTags ?? []).some(
      (tag) => tag.TagKey === EXCLUDE_TAG_KEY && tag.Status === 'Active',
    );
  } catch {
    // Unknown status (e.g. no ce:ListCostAllocationTags) — the region fallback
    // is the safe default; a real auth failure resurfaces on the cost query.
    return false;
  }
}

function buildFilter(
  services: string[] | undefined,
  exclusion: 'tag' | 'region' | 'none',
): Record<string, unknown> | undefined {
  const clauses: Record<string, unknown>[] = [];
  if (services) {
    clauses.push({ Dimensions: { Key: 'SERVICE', Values: services } });
  }
  if (exclusion === 'tag') {
    clauses.push({ Not: { Tags: { Key: EXCLUDE_TAG_KEY, Values: ['true'] } } });
  } else if (exclusion === 'region') {
    clauses.push({
      Not: { Dimensions: { Key: 'REGION', Values: [EXCLUDE_FALLBACK_REGION] } },
    });
  }
  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : { And: clauses };
}

async function fetchTotals(
  window: { start: string; end: string },
  granularity: 'DAILY' | 'MONTHLY',
  groupArg: string | undefined,
  filter: Record<string, unknown> | undefined,
  withUsage: boolean,
  cwd: string,
): Promise<PeriodTotals> {
  const totals: PeriodTotals = {
    byKey: new Map(),
    byTime: new Map(),
    total: 0,
  };
  let nextPageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const args = [
      'ce',
      'get-cost-and-usage',
      '--time-period',
      `Start=${window.start},End=${window.end}`,
      '--granularity',
      granularity,
      '--metrics',
      'UnblendedCost',
      ...(withUsage ? ['UsageQuantity'] : []),
      '--output',
      'json',
    ];
    if (groupArg) args.push('--group-by', groupArg);
    if (filter) args.push('--filter', JSON.stringify(filter));
    if (nextPageToken) args.push('--next-page-token', nextPageToken);

    const output = await runCommand('aws', args, cwd);
    const data = JSON.parse(output) as CeResponse;

    for (const bucket of data.ResultsByTime ?? []) {
      const time = bucket.TimePeriod?.Start ?? '';
      for (const group of bucket.Groups ?? []) {
        const key = group.Keys?.[0] ?? '';
        const cost = Number(group.Metrics?.UnblendedCost?.Amount ?? 0);
        const usage = Number(group.Metrics?.UsageQuantity?.Amount ?? 0);
        const entry = totals.byKey.get(key) ?? { cost: 0, usage: 0 };
        entry.cost += cost;
        entry.usage += usage;
        totals.byKey.set(key, entry);
        totals.byTime.set(time, (totals.byTime.get(time) ?? 0) + cost);
        totals.total += cost;
      }
    }

    nextPageToken = data.NextPageToken;
    if (!nextPageToken) break;
  }

  return totals;
}

function money(value: number): string {
  return value.toFixed(2);
}

function delta(current: number, previous: number): string {
  const diff = current - previous;
  const sign = diff >= 0 ? '+' : '';
  if (Math.abs(previous) < 0.005) {
    return Math.abs(current) < 0.005 ? '0.00' : `${sign}${money(diff)} (new)`;
  }
  return `${sign}${money(diff)} (${sign}${Math.round((diff / previous) * 100)}%)`;
}

/** A tag group key arrives as `Key$value`; an untagged group as `Key$`. */
function displayKey(key: string, groupBy: CostGroupBy): string {
  if (groupBy === 'tag') {
    const value = key.slice(key.indexOf('$') + 1);
    return value === '' ? '(untagged)' : value;
  }
  return key === '' ? '(none)' : key;
}

interface Row {
  [column: string]: unknown;
}

function buildRows(
  current: Map<string, GroupTotal>,
  previous: Map<string, GroupTotal> | undefined,
  label: string,
  withUsage: boolean,
  extra?: (key: string) => Row,
): Row[] {
  const keys = new Set([...current.keys(), ...(previous?.keys() ?? [])]);
  return [...keys]
    .map((key) => ({
      key,
      now: current.get(key) ?? { cost: 0, usage: 0 },
      prev: previous?.get(key) ?? { cost: 0, usage: 0 },
    }))
    .sort((a, b) => b.now.cost - a.now.cost || b.prev.cost - a.prev.cost)
    .map(({ key, now, prev }) => ({
      [label]: key,
      ...extra?.(key),
      cost: money(now.cost),
      ...(withUsage ? { usage: Number(now.usage.toFixed(2)) } : {}),
      ...(previous
        ? { prev: money(prev.cost), delta: delta(now.cost, prev.cost) }
        : {}),
    }));
}

function sumInto(
  target: Map<string, GroupTotal>,
  key: string,
  value: GroupTotal,
): void {
  const entry = target.get(key) ?? { cost: 0, usage: 0 };
  entry.cost += value.cost;
  entry.usage += value.usage;
  target.set(key, entry);
}

/** Re-key group totals (display name, EC2 bucket), summing collisions. */
function rekey(
  totals: Map<string, GroupTotal>,
  toKey: (key: string) => string,
): Map<string, GroupTotal> {
  const out = new Map<string, GroupTotal>();
  for (const [key, value] of totals) sumInto(out, toKey(key), value);
  return out;
}

export async function costExplorer(
  params: CostExplorerParams,
): Promise<ToolResult> {
  const {
    start,
    end,
    granularity = 'monthly',
    groupBy = 'service',
    tagKey,
    service,
    metrics = ['UnblendedCost'],
    compareWith,
    includeExcluded = false,
    limit = DEFAULT_LIMIT,
  } = params;

  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate) {
    return validationError(`Invalid start "${start}": must be YYYY-MM-DD.`);
  }
  if (!endDate) {
    return validationError(`Invalid end "${end}": must be YYYY-MM-DD.`);
  }
  if (endDate.getTime() - startDate.getTime() < DAY_MS) {
    return validationError(
      `end (${end}) must be after start (${start}); end is exclusive.`,
    );
  }
  if (groupBy === 'tag' && !tagKey) {
    return validationError('groupBy "tag" requires tagKey.');
  }
  if (tagKey && !TAG_KEY_RE.test(tagKey)) {
    return validationError(`Invalid tagKey "${tagKey}".`);
  }
  if (service && !SERVICE_RE.test(service)) {
    return validationError(`Invalid service "${service}".`);
  }

  const cwd = getRepoRoot();
  const withUsage = metrics.includes('UsageQuantity');
  const services = service
    ? (SERVICE_ALIASES[service.toLowerCase()] ?? [service])
    : undefined;
  const groupArg =
    groupBy === 'tag'
      ? `Type=TAG,Key=${tagKey ?? ''}`
      : `Type=DIMENSION,Key=${DIMENSION_KEYS[groupBy]}`;
  const ceGranularity = granularity === 'daily' ? 'DAILY' : 'MONTHLY';

  try {
    const exclusion = includeExcluded
      ? 'none'
      : (await isExcludeTagActive(cwd))
        ? 'tag'
        : 'region';
    const filter = buildFilter(services, exclusion);

    const window = { start, end };
    const prevWindow = compareWith ? previousPeriod(start, end) : undefined;
    const [current, previous] = await Promise.all([
      fetchTotals(window, ceGranularity, groupArg, filter, withUsage, cwd),
      prevWindow
        ? fetchTotals(
            prevWindow,
            ceGranularity,
            groupArg,
            filter,
            withUsage,
            cwd,
          )
        : Promise.resolve(undefined),
    ]);

    const lines: string[] = [];
    lines.push(
      `## Cost ${start} → ${end} (end exclusive) by ${groupBy === 'tag' ? `tag ${tagKey ?? ''}` : groupBy}` +
        (services ? ` — ${services.join(' + ')}` : ''),
    );
    lines.push(
      `Total: $${money(current.total)}` +
        (previous && prevWindow
          ? ` | previous ${prevWindow.start} → ${prevWindow.end}: $${money(previous.total)} | delta ${delta(current.total, previous.total)}`
          : ''),
    );
    lines.push(
      exclusion === 'tag'
        ? `Excludes resources tagged ${EXCLUDE_TAG_KEY}=true (spend from before the tag was activated is not excluded). Pass includeExcluded: true to include them.`
        : exclusion === 'region'
          ? `Excludes region ${EXCLUDE_FALLBACK_REGION} — FALLBACK: ${EXCLUDE_TAG_KEY} is not yet an active cost allocation tag, so the tagged personal resources (LS-10340) are excluded by region instead. Pass includeExcluded: true to include them.`
          : `Includes resources tagged ${EXCLUDE_TAG_KEY}=true (includeExcluded).`,
    );

    const currentByName = rekey(current.byKey, (k) => displayKey(k, groupBy));
    const previousByName = previous
      ? rekey(previous.byKey, (k) => displayKey(k, groupBy))
      : undefined;
    const isUsageType = groupBy === 'usage_type';

    if (isUsageType) {
      lines.push(
        '',
        '### EC2 buckets',
        markdownTable(
          buildRows(
            rekey(currentByName, ec2Bucket),
            previousByName ? rekey(previousByName, ec2Bucket) : undefined,
            'bucket',
            withUsage,
          ),
        ),
      );
    }

    const rows = buildRows(
      currentByName,
      previousByName,
      groupBy,
      withUsage,
      isUsageType ? (key) => ({ bucket: ec2Bucket(key) }) : undefined,
    );
    lines.push('', `### By ${groupBy}`);
    if (rows.length === 0) {
      lines.push('No cost data for this window.');
    } else {
      lines.push(markdownTable(rows.slice(0, limit)));
      if (rows.length > limit) {
        lines.push(
          `…${rows.length - limit} more rows below the top ${limit} (raise limit, max ${MAX_LIMIT}).`,
        );
      }
    }

    if (current.byTime.size > 1) {
      lines.push(
        '',
        `### ${granularity === 'daily' ? 'Daily' : 'Monthly'} trend`,
        markdownTable(
          [...current.byTime.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([period, cost]) => ({ period, cost: money(cost) })),
        ),
      );
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult('Failed to query Cost Explorer', message);
  }
}
