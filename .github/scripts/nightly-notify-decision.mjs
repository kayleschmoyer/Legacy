#!/usr/bin/env node
/**
 * Nightly Results Discord change detection (LS-10331).
 *
 * run-playwright-tests.yml's "Nightly Results" job used to post to Discord
 * on every executed automated run with no memory of the previous result —
 * with the suite red every day the channel was 100% noise. This module owns
 * the decision of whether the current run is worth a post, given the
 * previous run's persisted state (S3:
 * `ci-artifacts/nightly-state/last.json`, read/written by the workflow).
 *
 * A run posts when:
 *   - there is no previous state (first run, or the state expired — the
 *     ci-artifacts bucket has a 3-day lifecycle expiry, so an idle repo
 *     that runs no nightly for >3 days re-baselines with one extra post);
 *   - the overall status flipped (red → green is the "recovery" post,
 *     green → red is the "regression" post);
 *   - the status is still red but the set of failing tests changed (new
 *     failures and/or recoveries);
 *   - the status is red and unchanged for DIGEST_EVERY consecutive runs
 *     (a weekly digest at the ~1 run/day cadence, so a permanently red
 *     suite is never silent for more than a week).
 *
 * Everything else — an identical red, or a green after a green — is a
 * silent no-op. Manual dispatches never go through this module (they are
 * debugging sessions and always post).
 *
 * Fail-open: the workflow treats any error from the CLI as "post" so a
 * malformed state file can never suppress a notification.
 *
 * CLI:
 *   node nightly-notify-decision.mjs \
 *     --status <success|failure> \
 *     --run-id <id> \
 *     --next-state-file <path>          # where to write the new state JSON
 *     [--previous-file <path>]          # last.json (missing/unreadable → first run)
 *     [--ledger-file <path>]            # agent-md-reporter e2e-ledger.json (missing → no spec detail)
 *     [--timestamp <iso>]               # default: now
 *
 * Writes `post`, `reason` and a multi-line `summary` to $GITHUB_OUTPUT
 * (stdout when unset).
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Every Nth consecutive identical red run re-posts as a digest. */
export const DIGEST_EVERY = 7;

/** Max failing tests listed per section in the Discord summary. */
const SUMMARY_LIST_LIMIT = 10;

const log = (...args) => console.error(...args);

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Normalise a status string to the two states the decision cares about.
 * Anything that is not an explicit success is a failure — mirrors the
 * workflow's "treat skipped/cancelled as failure" rule.
 */
export function normalizeStatus(status) {
  return status === 'success' ? 'success' : 'failure';
}

/**
 * Extract the sorted, de-duplicated list of failing test identities
 * (`<spec> › <testName>`) from the agent-md-reporter's ledger JSON
 * (`{ entries: [{ spec, testName, status, retryCount }] }`). Flaky tests
 * passed on retry and are not failures. Tolerates a missing/malformed
 * ledger by returning an empty list.
 */
export function extractFailingTests(ledger) {
  const entries = Array.isArray(ledger?.entries) ? ledger.entries : [];
  const failing = new Set();
  for (const entry of entries) {
    if (!entry || entry.status !== 'failed') continue;
    if (typeof entry.spec !== 'string' || entry.spec.length === 0) continue;
    const name =
      typeof entry.testName === 'string' && entry.testName.length > 0
        ? `${entry.spec} › ${entry.testName}`
        : entry.spec;
    failing.add(name);
  }
  return [...failing].sort();
}

/**
 * Coerce a persisted state object into a well-formed previous state, or
 * `null` when it is absent or unusable (which the decision treats as a
 * first run rather than trusting garbage).
 */
export function parsePreviousState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.status !== 'success' && raw.status !== 'failure') return null;
  const failingTests = Array.isArray(raw.failingTests)
    ? [...new Set(raw.failingTests.filter((t) => typeof t === 'string'))].sort()
    : [];
  const consecutiveReds =
    Number.isInteger(raw.consecutiveReds) && raw.consecutiveReds >= 0
      ? raw.consecutiveReds
      : raw.status === 'failure'
        ? 1
        : 0;
  return { status: raw.status, failingTests, consecutiveReds };
}

function diffSets(before, after) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((t) => !beforeSet.has(t)),
    removed: before.filter((t) => !afterSet.has(t)),
  };
}

/**
 * Decide whether the current run should post, and compute the state to
 * persist for the next run.
 *
 * @param {object} args
 * @param {{status: 'success'|'failure', failingTests: string[], consecutiveReds: number} | null} args.previous
 * @param {{status: string, failingTests?: string[]}} args.current
 * @param {number} [args.digestEvery]
 * @returns {{
 *   post: boolean,
 *   reason: 'first-run'|'status-changed'|'failing-tests-changed'|'digest'|'unchanged',
 *   newFailures: string[],
 *   recovered: string[],
 *   nextState: {status: 'success'|'failure', failingTests: string[], consecutiveReds: number},
 * }}
 */
export function decideNightlyNotification({
  previous,
  current,
  digestEvery = DIGEST_EVERY,
}) {
  const status = normalizeStatus(current?.status);
  const failingTests = [...new Set(current?.failingTests ?? [])].sort();
  const prev = parsePreviousState(previous);

  const consecutiveReds =
    status === 'failure'
      ? prev?.status === 'failure'
        ? prev.consecutiveReds + 1
        : 1
      : 0;
  const nextState = { status, failingTests, consecutiveReds };
  const { added: newFailures, removed: recovered } = diffSets(
    prev?.failingTests ?? [],
    failingTests,
  );

  if (!prev) {
    return {
      post: true,
      reason: 'first-run',
      newFailures,
      recovered,
      nextState,
    };
  }
  if (prev.status !== status) {
    return {
      post: true,
      reason: 'status-changed',
      newFailures,
      recovered,
      nextState,
    };
  }
  if (
    status === 'failure' &&
    (newFailures.length > 0 || recovered.length > 0)
  ) {
    return {
      post: true,
      reason: 'failing-tests-changed',
      newFailures,
      recovered,
      nextState,
    };
  }
  if (status === 'failure' && consecutiveReds % digestEvery === 0) {
    return { post: true, reason: 'digest', newFailures, recovered, nextState };
  }
  return {
    post: false,
    reason: 'unchanged',
    newFailures,
    recovered,
    nextState,
  };
}

function formatList(items) {
  const shown = items.slice(0, SUMMARY_LIST_LIMIT).map((t) => `• \`${t}\``);
  if (items.length > SUMMARY_LIST_LIMIT) {
    shown.push(`• …and ${items.length - SUMMARY_LIST_LIMIT} more`);
  }
  return shown;
}

/**
 * Markdown lines appended to the Discord embed description explaining why
 * this run posted. Empty for a silent run.
 */
export function formatChangeSummary(
  decision,
  { digestEvery = DIGEST_EVERY } = {},
) {
  if (!decision.post) return '';
  const { reason, newFailures, recovered, nextState } = decision;
  const lines = [];
  switch (reason) {
    case 'first-run':
      lines.push('**Change:** first tracked run — baseline recorded');
      break;
    case 'status-changed':
      lines.push(
        nextState.status === 'success'
          ? '**Change:** ✅ recovered — suite is green again'
          : '**Change:** ❌ regression — suite went red',
      );
      break;
    case 'failing-tests-changed':
      lines.push('**Change:** failing test set changed');
      break;
    case 'digest':
      lines.push(
        `**Digest:** still red — ${nextState.consecutiveReds} consecutive identical red runs (posted every ${digestEvery})`,
      );
      break;
    default:
      break;
  }
  if (newFailures.length > 0) {
    lines.push(
      `**New failures (${newFailures.length}):**`,
      ...formatList(newFailures),
    );
  }
  if (recovered.length > 0) {
    lines.push(
      `**Recovered (${recovered.length}):**`,
      ...formatList(recovered),
    );
  }
  if (reason === 'digest' && nextState.failingTests.length > 0) {
    lines.push(
      `**Still failing (${nextState.failingTests.length}):**`,
      ...formatList(nextState.failingTests),
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readJsonIfPresent(path, label) {
  if (!path || !existsSync(path)) {
    log(`[nightly-notify] no ${label} at ${path ?? '(unset)'}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    log(`[nightly-notify] unreadable ${label} at ${path}: ${err.message}`);
    return null;
  }
}

function emitOutput(name, value) {
  const body = value.includes('\n')
    ? `${name}<<EOF_NIGHTLY_NOTIFY\n${value}\nEOF_NIGHTLY_NOTIFY\n`
    : `${name}=${value}\n`;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, body);
  } else {
    process.stdout.write(body);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.status || !args['next-state-file']) {
    log(
      'usage: nightly-notify-decision.mjs --status <s> --run-id <id> --next-state-file <path> [--previous-file <path>] [--ledger-file <path>]',
    );
    process.exit(2);
  }

  const previous = readJsonIfPresent(args['previous-file'], 'previous state');
  const ledger = readJsonIfPresent(args['ledger-file'], 'ledger');
  const failingTests = extractFailingTests(ledger);

  const decision = decideNightlyNotification({
    previous,
    current: { status: args.status, failingTests },
  });

  const nextState = {
    ...decision.nextState,
    runId: args['run-id'] ?? null,
    timestamp: args.timestamp ?? new Date().toISOString(),
  };
  mkdirSync(dirname(args['next-state-file']), { recursive: true });
  writeFileSync(
    args['next-state-file'],
    `${JSON.stringify(nextState, null, 2)}\n`,
    'utf-8',
  );

  log(
    `[nightly-notify] status=${nextState.status} failing=${failingTests.length} ` +
      `consecutiveReds=${nextState.consecutiveReds} → post=${decision.post} (${decision.reason})`,
  );
  emitOutput('post', String(decision.post));
  emitOutput('reason', decision.reason);
  emitOutput('summary', formatChangeSummary(decision));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
