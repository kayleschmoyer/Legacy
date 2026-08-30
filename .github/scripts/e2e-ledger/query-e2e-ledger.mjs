#!/usr/bin/env node
/**
 * Query a spec's full historical E2E ledger timeline (LS-9757).
 *
 * The write side (build-ledger-records.mjs, wired into ci-pipeline.yml's
 * "Deploy Playwright Report" job and run-playwright-tests.yml's
 * "deploy-report" job) stages one NDJSON file per spec per run at
 * `s3://<bucket>/e2e-ledger/v1/spec/<spec>/<sha>-<runId>.ndjson`. Because
 * the key is spec-first, every record for a given spec is a single
 * ListObjectsV2 prefix listing — no need to scan every commit that ever
 * ran E2E, unlike the sha-first layout the `s3-artifact` composite action
 * uses for other CI artifacts.
 *
 * This is the query primitive LS-9758 (bisecting a regression to its
 * introducing commit) will build on — see
 * .agents/skills/testing/references/e2e-ledger.md for how to run it and
 * how the follow-up ticket is meant to consume it.
 *
 * Usage:
 *   node query-e2e-ledger.mjs --spec <spec-path> [--bucket <name>] [--json]
 *
 * Requires AWS credentials in the environment (the default SDK credential
 * chain — an assumed CI role, or a local `aws sso login` session) with
 * read access to the bucket.
 */

import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { pathToFileURL } from 'node:url';

const DEFAULT_BUCKET = 'legacy-sports-dev-ci-artifacts';
const LEDGER_PREFIX = 'e2e-ledger/v1/spec/';

/** Parse one spec's worth of NDJSON object bodies into records, tolerating
 * a malformed line (skip it) rather than failing the whole query. */
export function parseNdjson(text) {
  const records = [];
  for (const line of (text ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      // Skip malformed lines — one bad record must not hide the rest of
      // the timeline.
    }
  }
  return records;
}

/** Sort records oldest → newest by timestamp (stable for ties). */
export function sortByTimestamp(records) {
  return [...records].sort((a, b) =>
    String(a.timestamp ?? '').localeCompare(String(b.timestamp ?? '')),
  );
}

async function streamToString(body) {
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** Fetch and merge every ledger record for `spec` from S3. */
export async function fetchSpecTimeline({ s3, bucket, spec }) {
  const prefix = `${LEDGER_PREFIX}${spec}/`;
  const keys = [];
  let continuationToken;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of page.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = page.IsTruncated
      ? page.NextContinuationToken
      : undefined;
  } while (continuationToken);

  const allRecords = [];
  for (const key of keys) {
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const text = await streamToString(obj.Body);
    allRecords.push(...parseNdjson(text));
  }
  return sortByTimestamp(allRecords);
}

/** Render a timeline as a compact text table. */
export function renderTimelineTable(spec, records) {
  if (records.length === 0) {
    return `No ledger records found for ${spec}.`;
  }
  const lines = [
    `Timeline for ${spec} (${records.length} record(s)):`,
    '',
    'timestamp                 sha        pr      status   retries  relatedToDiff  test',
  ];
  for (const r of records) {
    lines.push(
      [
        String(r.timestamp ?? '').padEnd(26),
        String(r.sha ?? '')
          .slice(0, 9)
          .padEnd(10),
        String(r.prNumber ?? 'nightly').padEnd(7),
        String(r.status ?? '').padEnd(8),
        String(r.retryCount ?? 0).padEnd(9),
        String(r.relatedToDiff ?? 'null').padEnd(14),
        r.testName ?? '',
      ].join(' '),
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { spec: null, bucket: DEFAULT_BUCKET, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--spec') args.spec = argv[++i];
    else if (a === '--bucket') args.bucket = argv[++i];
    else if (a === '--json') args.json = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.spec) {
    console.error(
      'usage: node query-e2e-ledger.mjs --spec <spec-path> [--bucket <name>] [--json]',
    );
    process.exitCode = 2;
    return;
  }

  const s3 = new S3Client({});
  const records = await fetchSpecTimeline({
    s3,
    bucket: args.bucket,
    spec: args.spec,
  });

  if (args.json) {
    console.log(JSON.stringify({ spec: args.spec, records }, null, 2));
  } else {
    console.log(renderTimelineTable(args.spec, records));
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
