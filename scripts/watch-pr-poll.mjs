#!/usr/bin/env node
/**
 * watch-pr-poll: one poll of the scripts/watch-pr.sh state machine (LS-10598).
 *
 *   node scripts/watch-pr-poll.mjs <state-file> <cur-json-file> <PR#> <now-ts> <rebaseline 0|1> <stall-secs>
 *
 * Diffs the current `gh pr view --json ...` payload (written to <cur-json-file>
 * by the bash loop) against the previous poll's <state-file>, prints one stdout
 * line per actionable transition, and persists the new state.
 *
 * Exit codes (consumed by watch-pr.sh):
 *   0  = poll processed (zero or more event lines printed)
 *   10 = terminal PR state (MERGED/CLOSED) — the watch ends cleanly
 *   2  = malformed args/payload or an unexpected error — one diagnostic line
 *        was printed; the bash loop counts it toward its failure budget
 *
 * This is a line-for-line port of the Python heredoc watch-pr.sh used to embed.
 * Python was dropped because on Windows hosts `python` often resolves only to
 * the Microsoft Store App Execution Alias (%LOCALAPPDATA%\Microsoft\WindowsApps),
 * which prints "Python was not found..." on every call and killed the watch
 * after 5 polls. Node is guaranteed on every dev host (modules-pool/link.mjs and
 * every MCP server need it), so this file is dependency-free: node builtins only.
 *
 * Compatibility contract — keep these identical to the Python original
 * (scripts/__tests__/watch-pr.test.mjs runs a differential test against a
 * frozen copy of it whenever a real Python is available):
 *  - every emitted event line, byte for byte;
 *  - the state-file bytes: Python json.dump formatting (", " / ": " separators,
 *    ensure_ascii \uXXXX escapes, sorted keys in the fingerprint) — see pyDumps;
 *  - Python semantics where they differ from JS: dict.get returns the stored
 *    value even when it is null, `x or default` uses Python truthiness, f-string
 *    rendering of None/True/False, and sorted() compares by code point.
 * Diagnostic (exit-2) lines carry Node's error text instead of Python's.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

class PollExit extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
}

const out = [];
const print = (line) => out.push(line);
const exit = (code) => {
  throw new PollExit(code);
};

// ---------------------------------------------------------------------------
// Python-semantics helpers
// ---------------------------------------------------------------------------

const isDict = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function pyTypeName(v) {
  if (v === null) return 'NoneType';
  if (Array.isArray(v)) return 'list';
  if (typeof v === 'string') return 'str';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
  return 'dict';
}

/** dict.get(key, dflt): a present-but-null value is returned as null. */
function get(obj, key, dflt = null) {
  if (!isDict(obj)) {
    throw new TypeError(
      `'${pyTypeName(obj)}' object has no attribute 'get' (key ${key})`,
    );
  }
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : dflt;
}

function truthy(v) {
  if (v === null || v === undefined || v === false || v === 0 || v === '') {
    return false;
  }
  if (Array.isArray(v)) return v.length > 0;
  if (isDict(v)) return Object.keys(v).length > 0;
  return true;
}

/** `x or default` */
const or = (v, dflt) => (truthy(v) ? v : dflt);

/** Iterate `(x or [])` — only lists are iterated (dicts/strings would differ). */
function iterList(v) {
  const x = or(v, []);
  if (!Array.isArray(x)) {
    throw new TypeError(`expected a list, got '${pyTypeName(x)}'`);
  }
  return x;
}

/** f-string rendering of a scalar. */
function fmt(v) {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return JSON.stringify(v);
}

/** Python str ordering: code point, not UTF-16 code unit. */
function cmpStr(a, b) {
  const ai = a[Symbol.iterator]();
  const bi = b[Symbol.iterator]();
  for (;;) {
    const x = ai.next();
    const y = bi.next();
    if (x.done || y.done) return x.done === y.done ? 0 : x.done ? -1 : 1;
    const d = x.value.codePointAt(0) - y.value.codePointAt(0);
    if (d !== 0) return d;
  }
}

/** sorted() over strings. */
const sorted = (iterable) => [...iterable].sort(cmpStr);

function strGe(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    throw new TypeError(
      `'>=' not supported between '${pyTypeName(a)}' and '${pyTypeName(b)}'`,
    );
  }
  return cmpStr(a, b) >= 0;
}

/** json.dumps(v, sort_keys=sortKeys) with Python's default formatting. */
function pyDumps(v, sortKeys = false) {
  if (v === null || v === undefined) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    if (!Number.isFinite(v)) return v > 0 ? 'Infinity' : '-Infinity';
    return String(v);
  }
  if (typeof v === 'string') {
    // ensure_ascii: Python escapes everything outside 0x20..0x7E.
    return JSON.stringify(v).replace(
      /[\u007f-￿]/g,
      (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
  }
  if (Array.isArray(v)) {
    return `[${v.map((x) => pyDumps(x, sortKeys)).join(', ')}]`;
  }
  const keys = Object.keys(v);
  if (sortKeys) keys.sort(cmpStr);
  return `{${keys.map((k) => `${pyDumps(k)}: ${pyDumps(v[k], sortKeys)}`).join(', ')}}`;
}

function parseInt10(s) {
  if (typeof s !== 'string' || !/^\s*[+-]?\d+\s*$/.test(s)) {
    throw new RangeError(`invalid literal for int() with base 10: '${s}'`);
  }
  return Number.parseInt(s.trim(), 10);
}

// ---------------------------------------------------------------------------
// One poll
// ---------------------------------------------------------------------------

function pollBody(cur, stateFile, pr, nowTs, rebaseline, stallSecs) {
  let prev = {};
  if (existsSync(stateFile)) {
    try {
      prev = JSON.parse(readFileSync(stateFile, 'utf8'));
    } catch {
      prev = {};
    }
  }
  const baseline = !truthy(prev); // first successful poll after arming

  const sha = or(get(cur, 'headRefOid'), '').slice(0, 7);
  const emitted = new Set(get(prev, 'emitted', []));
  const pending = { ...get(prev, 'pending', {}) }; // condition-key -> consecutive-poll count
  const events = [];

  const emitOnce = (key, line) => {
    if (!emitted.has(key)) {
      events.push(line);
      emitted.add(key);
    }
  };

  /** Emit after the condition holds for 2 consecutive polls; reset when clear. */
  const emitDebounced = (key, line, active) => {
    if (!active) {
      delete pending[key];
      return;
    }
    pending[key] = (pending[key] ?? 0) + 1;
    if (pending[key] >= 2) emitOnce(key, line);
  };

  // --- Terminal states (computed from current state alone; ignore rebaseline) ---
  const state = get(cur, 'state', '');
  if (state === 'MERGED') {
    print(
      `PR #${pr} MERGED — terminal. Proceed to post-merge steps: verify Jira Done, complete tracking tasks, MCP gap audit.`,
    );
    exit(10);
  }
  if (state === 'CLOSED') {
    print(`PR #${pr} CLOSED without merge — terminal. Report and stop.`);
    exit(10);
  }

  // --- Normalize the merge-gate picture from statusCheckRollup ---
  // CheckRun nodes can appear more than once per name (Actions job run + the
  // sweep's API-owned run live in different suites); newest startedAt wins —
  // matching the newest-run-wins semantics of the merge gate and the sweep.
  const checks = new Map(); // name -> node (newest)
  const statuses = new Map(); // context -> state
  for (const node of iterList(get(cur, 'statusCheckRollup'))) {
    const t = get(node, '__typename', '');
    if (t === 'CheckRun') {
      const name = get(node, 'name', '');
      const prevNode = checks.get(name);
      if (
        prevNode === undefined ||
        strGe(
          or(get(node, 'startedAt'), ''),
          or(get(prevNode, 'startedAt'), ''),
        )
      ) {
        checks.set(name, node);
      }
    } else if (t === 'StatusContext') {
      statuses.set(get(node, 'context', ''), get(node, 'state', ''));
    }
  }

  const RED_STATUS = new Set(['FAILURE', 'ERROR']);
  const status = (ctx) => (statuses.has(ctx) ? statuses.get(ctx) : null);

  const labels = new Set(
    iterList(get(cur, 'labels')).map((l) => get(l, 'name', '')),
  );
  const prevLabels = new Set(get(prev, 'labels', []));

  // --- Conflict (corroborated + debounced; label is never the trigger) ---
  // "No Merge Conflicts" is a COMMIT STATUS (StatusContext), not a check run
  // (LS-9604; .github/ruleset.json) — read it from `statuses` (LS-10374).
  const nmcRed = RED_STATUS.has(status('No Merge Conflicts'));
  const conflicting = get(cur, 'mergeable') === 'CONFLICTING' || nmcRed;
  if (!conflicting) {
    // Re-arm: a conflict that clears and returns on the same head SHA must be
    // announced again, so drop the persisted once-key while it is clear.
    emitted.delete(`conflict:${sha}`);
  }
  emitDebounced(
    `conflict:${sha}`,
    `conflict: PR #${pr} has merge conflicts with main on ${sha} ` +
      `(mergeable=${fmt(get(cur, 'mergeable'))}, No Merge Conflicts=${nmcRed ? 'red' : 'n/a'}). ` +
      `Run /rebase now: resolve, push --force-with-lease, re-apply bot:ready-for-review.`,
    conflicting,
  );

  // --- Red required contexts + early-signal CI Pipeline checks (debounced) ---
  const RED_CHECK = new Set(['FAILURE', 'TIMED_OUT']);
  for (const [name, node] of checks) {
    const early = String(name).startsWith('\u{1F680} CI Pipeline /');
    if (early && RED_CHECK.has(get(node, 'conclusion'))) {
      emitDebounced(
        `red:${fmt(name)}:${sha}`,
        `check red: '${fmt(name)}' = ${fmt(get(node, 'conclusion'))} on ${sha} — triage per ci-event-response.md (ci_list_runs → ci_get_logs).`,
        true,
      );
    } else {
      delete pending[`red:${fmt(name)}:${sha}`];
    }
  }
  // "No Merge Conflicts" is excluded: red is the conflict signal handled above.
  // "Verify All Migrations Applied" is a commit status too (LS-9776).
  for (const ctx of [
    'bot-review',
    'CI Gate',
    'Verify All Migrations Applied',
  ]) {
    const st = status(ctx);
    emitDebounced(
      `red-status:${ctx}:${sha}`,
      `status red: '${ctx}' = ${fmt(st)} on ${sha} — ` +
        (ctx === 'bot-review'
          ? 'fetch review threads and respond per Author Agent Contract.'
          : 'the CI pipeline failed; triage per ci-event-response.md.'),
      RED_STATUS.has(st),
    );
  }

  // --- Label transitions (post-baseline only; adds of escalation/CI labels) ---
  const WATCHED_ADD = new Set([
    'needs-human-arbitration',
    'needs-human-security-review',
    'needs-human-review',
    'review-bot-degraded',
    'review-bot-billing',
    'ci-stuck',
  ]);
  // LS-9812: review-bot-billing is the one watched label whose remedy is NOT
  // "retry the bot" — the reviewer has no API credits, so re-applying
  // bot:ready-for-review just burns another run. Say so explicitly rather than
  // routing it to the generic triage doc.
  const LABEL_ADD_HINTS = {
    'review-bot-billing': (p) =>
      `label: 'review-bot-billing' added to PR #${p} — the Reviewer Bot's LLM ` +
      'credits are depleted. Do NOT re-apply bot:ready-for-review; it cannot ' +
      'succeed. Escalate to the account owner to top up billing.',
  };
  if (!baseline && !rebaseline) {
    for (const lbl of sorted([...labels].filter((l) => !prevLabels.has(l)))) {
      if (
        WATCHED_ADD.has(lbl) ||
        (lbl.startsWith('CI: ') && lbl !== 'CI: Conflicts')
      ) {
        const hint = LABEL_ADD_HINTS[lbl];
        emitOnce(
          `label-add:${lbl}:${sha}`,
          hint
            ? hint(pr)
            : `label: '${lbl}' added to PR #${pr} — triage per ci-event-response.md.`,
        );
      }
    }
    if (prevLabels.has('merge-when-ready') && !labels.has('merge-when-ready')) {
      emitOnce(
        `mwr-removed:${sha}`,
        `label: merge-when-ready removed from PR #${pr} — a required check went red or the gate stripped it; fix the upstream cause, never re-add manually.`,
      );
    }
  }

  // --- New reviews (post-baseline only) ---
  const author = (r) => get(get(r, 'author', {}), 'login', '?');
  const reviewKey = (r) =>
    `${fmt(author(r))}:${fmt(get(r, 'state', '?'))}:${fmt(get(r, 'submittedAt', '?'))}`;
  const latestReviews = iterList(get(cur, 'latestReviews'));
  const curReviews = new Set(latestReviews.map(reviewKey));
  const prevReviews = new Set(get(prev, 'reviews', []));
  if (!baseline && !rebaseline) {
    for (const r of latestReviews) {
      const k = reviewKey(r);
      if (!prevReviews.has(k)) {
        emitOnce(
          `review:${k}`,
          `review: ${fmt(author(r))} submitted ${fmt(get(r, 'state', '?'))} on PR #${pr} — respond per Author Agent Contract (FIX:/JUSTIFY:), then re-apply bot:ready-for-review.`,
        );
      }
    }
  }

  // --- All-required-terminal summary (once per head SHA) ---
  // All four merge-gate contexts are commit statuses (.github/ruleset.json).
  const REQUIRED_STATUSES = [
    'bot-review',
    'CI Gate',
    'No Merge Conflicts',
    'Verify All Migrations Applied',
  ];
  const gate = {};
  let allTerminal = true;
  for (const ctx of REQUIRED_STATUSES) {
    const st = or(status(ctx), 'ABSENT');
    gate[ctx] = st;
    if (['ABSENT', 'PENDING', 'EXPECTED'].includes(st)) allTerminal = false;
  }
  const isDraft = truthy(get(cur, 'isDraft'));
  if (allTerminal && !isDraft) {
    const summary = Object.entries(gate)
      .map(([k, v]) => `${k}=${fmt(v)}`)
      .join(', ');
    emitOnce(
      `gate-terminal:${sha}`,
      `gate complete on ${sha}: ${summary} — evaluate merge readiness (if all green, the Reviewer Bot applies merge-when-ready itself; if any red, fix it).`,
    );
  }

  // --- Stall detection: required statuses absent/pending with no progress ---
  // This is the SKIPPED-pipeline stall (ci-event-response.md "Pipeline Skipped /
  // Never Ran"): bot-review and CI Gate never go red when the pipeline never
  // fires — they stay absent. Nothing else would ever emit, so the watch must.
  const fpChecks = {};
  for (const [k, v] of checks)
    fpChecks[k] = [get(v, 'status'), get(v, 'conclusion')];
  const fpStatuses = {};
  for (const [k, v] of statuses) fpStatuses[k] = v;
  const fingerprint = pyDumps({ c: fpChecks, s: fpStatuses }, true);
  const progressTs =
    fingerprint !== get(prev, 'fingerprint') || sha !== get(prev, 'sha')
      ? nowTs
      : get(prev, 'progress_ts', nowTs);
  const gateIncomplete = !allTerminal;
  if (
    gateIncomplete &&
    !isDraft &&
    nowTs - progressTs > stallSecs &&
    !rebaseline
  ) {
    const missing = Object.entries(gate)
      .filter(([, v]) => ['ABSENT', 'PENDING', 'EXPECTED', ''].includes(v))
      .map(([k]) => k);
    emitOnce(
      `stall:${sha}:${fmt(progressTs)}`,
      `stall: no merge-gate progress on ${sha} for ${Math.floor((nowTs - progressTs) / 60)} min (incomplete: ${missing.join(', ') || 'unknown'}) — probable SKIPPED pipeline; re-apply bot:ready-for-review as the LAST label op, then confirm the pipeline starts.`,
    );
  }

  // --- Persist state ---
  writeFileSync(
    stateFile,
    pyDumps({
      sha,
      labels: sorted(labels),
      reviews: sorted(curReviews),
      emitted: sorted(emitted),
      pending,
      fingerprint,
      progress_ts: progressTs,
    }),
  );

  for (const line of events) print(line);
}

function main(argv) {
  let stateFile, curJsonFile, pr, nowTs, rebaseline, stallSecs;
  try {
    if (argv.length < 6) throw new RangeError('list index out of range');
    [stateFile, curJsonFile, pr] = argv;
    nowTs = parseInt10(argv[3]);
    rebaseline = argv[4] === '1';
    stallSecs = parseInt10(argv[5]);
  } catch (e) {
    print(
      `watch: malformed poll arguments this cycle (${e.message}) — skipping, will retry next interval.`,
    );
    exit(2);
  }

  // A single bad or unexpectedly-shaped payload (empty body, non-JSON text,
  // valid JSON of the wrong type, an unforeseen field shape) must never crash
  // the watch raw (LS-8805, LS-9337): print one diagnostic line and exit 2 so
  // the bash loop counts it toward its failure budget.
  let cur;
  try {
    cur = JSON.parse(readFileSync(curJsonFile, 'utf8'));
  } catch (e) {
    print(
      `watch #${pr}: malformed gh payload this poll (${e.message}) — skipping, will retry next interval.`,
    );
    exit(2);
  }
  if (!isDict(cur)) {
    print(
      `watch #${pr}: unexpected gh payload shape this poll (got ${pyTypeName(cur)}, expected object) — skipping, will retry next interval.`,
    );
    exit(2);
  }

  try {
    pollBody(cur, stateFile, pr, nowTs, rebaseline, stallSecs);
  } catch (e) {
    if (e instanceof PollExit) throw e;
    print(
      `watch #${pr}: unexpected error processing this poll (${e?.name ?? 'Error'}: ${e?.message ?? e}) — skipping, will retry next interval.`,
    );
    exit(2);
  }
}

// Exit via process.exitCode after a single synchronous write, never
// process.exit(): stdout to a pipe can be async and would truncate lines.
try {
  main(process.argv.slice(2));
  process.exitCode = 0;
} catch (e) {
  if (!(e instanceof PollExit)) throw e;
  process.exitCode = e.code;
}
if (out.length) process.stdout.write(`${out.join('\n')}\n`);
