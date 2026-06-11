#!/usr/bin/env node
/**
 * Surface-map auto-remediation bot (LS-7851, remediation child of LS-7848
 * "coverage-driven surface-map auto-sync"). This is the child that CLOSES THE
 * LOOP: it turns the drift the auditor (LS-7850) detects into a reviewable map
 * update — the actual "sync."
 *
 * It consumes the auditor's JSON output (the `underSelection` findings emitted
 * by `audit-coverage.mjs --json`) and ADDITIVELY merges each finding's suggested
 * directory globs into the surface map that owns the spec:
 *   - apps/web-e2e/src/e2e-surface-map.json                     (hermetic, LS-7846)
 *   - apps/web-e2e/src/integration/integration-surface-map.json (live-backend)
 *
 * The globs the auditor suggests are already collapsed to directory level
 * (`<dir>/**`, via collapseToDirGlobs), so the proposal is intentionally broad —
 * over-selection is safe, under-selection is the regression risk we design
 * against. A spec already in the map gains the missing globs (appended, deduped,
 * existing order preserved); a brand-new, never-mapped spec is onboarded with a
 * fresh entry inserted in sorted position. This is the new-source-file
 * onboarding mechanism: when a spec is observed exercising a file no glob
 * covers, propose the glob that covers it.
 *
 * Hard safety boundaries (the whole reason this is additive-only automation):
 *   - NEVER removes or shrinks a glob. Dead-glob pruning (the auditor's LOW
 *     signal) stays a deliberate HUMAN decision — removing a glob risks silently
 *     reintroducing under-selection, so a bot must never do it.
 *   - NEVER touches `runAllWhenChanged` (the safety net) or dead-glob findings.
 *   - NEVER merges. The output is a normal PR, reviewed and merged by a human
 *     like any other. The workflow applies no merge label.
 *
 * Idempotency is achieved by the workflow re-deriving the FULL desired map state
 * from main + the current night's findings each run and force-updating a single
 * standing branch — so the one open remediation PR is refreshed in place rather
 * than duplicated. This module is correspondingly pure and order-independent:
 * applying the same findings to the same map twice yields the same map and
 * `changed: false` the second time.
 *
 * Usage:
 *   node remediate-surface-map.mjs \
 *     --audit-json <path>              # JSON emitted by audit-coverage.mjs --json
 *     --e2e-map <path> --integration-map <path> \
 *     [--write]                        # write the patched maps back in place
 *     [--pr-body-out <path>]           # write the PR body markdown
 *     [--run-url <url>]                # nightly run URL, embedded in the PR body
 *     [--github-output]                # print key=value lines for $GITHUB_OUTPUT
 *
 * All progress logging goes to stderr so stdout stays clean for --github-output.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const log = (...args) => console.error(...args);

const MAP_NAMES = ['e2e', 'integration'];

// ---------------------------------------------------------------------------
// Additive merge primitives
// ---------------------------------------------------------------------------

/**
 * Union `suggested` globs into `existing`, additively. Existing order is
 * preserved; only genuinely-new globs are appended (in their given order, which
 * the auditor already sorts). Never drops an existing glob.
 *
 * @returns {{ globs: string[], added: string[] }}
 */
export function mergeSpecGlobs(existing, suggested) {
  const have = new Set(existing);
  const added = [];
  for (const g of suggested) {
    if (!have.has(g)) {
      have.add(g);
      added.push(g);
    }
  }
  return { globs: [...existing, ...added], added };
}

/**
 * Return a new `specs` object with `spec` set to `globs`. An existing spec is
 * replaced in place (key order untouched); a new spec is inserted in sorted
 * position so onboarded entries match the map's alphabetical convention and the
 * diff stays reviewer-friendly.
 */
export function withSpec(specs, spec, globs) {
  if (Object.prototype.hasOwnProperty.call(specs, spec)) {
    const out = {};
    for (const k of Object.keys(specs)) out[k] = k === spec ? globs : specs[k];
    return out;
  }
  const out = {};
  let inserted = false;
  for (const k of Object.keys(specs)) {
    if (!inserted && spec.localeCompare(k) < 0) {
      out[spec] = globs;
      inserted = true;
    }
    out[k] = specs[k];
  }
  if (!inserted) out[spec] = globs;
  return out;
}

// ---------------------------------------------------------------------------
// Remediation
// ---------------------------------------------------------------------------

/**
 * Apply the under-selection findings that target a single map, additively.
 *
 * @param {{ runAllWhenChanged?: string[], specs: Record<string, string[]> }} map
 * @param {Array<{ spec: string, mapped: boolean, files: string[], suggestedGlobs: string[] }>} findings
 * @returns {{ map: object, changed: boolean, changes: Array<{ spec: string, onboarded: boolean, added: string[] }> }}
 */
export function applyRemediation(map, findings) {
  let specs = map.specs ?? {};
  const changes = [];
  for (const f of findings) {
    const suggested = Array.isArray(f.suggestedGlobs) ? f.suggestedGlobs : [];
    if (suggested.length === 0) continue;
    const existing = specs[f.spec] ?? [];
    const onboarded = !Object.prototype.hasOwnProperty.call(specs, f.spec);
    const { globs, added } = mergeSpecGlobs(existing, suggested);
    if (added.length === 0) continue; // already covered — idempotent no-op
    specs = withSpec(specs, f.spec, globs);
    changes.push({ spec: f.spec, onboarded, added });
  }
  // Rebuild preserving the map's top-level key order ($comment, runAll, specs).
  const nextMap = {};
  for (const k of Object.keys(map)) nextMap[k] = k === 'specs' ? specs : map[k];
  if (!('specs' in nextMap)) nextMap.specs = specs;
  return { map: nextMap, changed: changes.length > 0, changes };
}

/**
 * Split the auditor's flat under-selection list into per-map findings. Dead-glob
 * findings are intentionally ignored — pruning is a human decision.
 */
export function partitionFindings(audit) {
  const underSelection = Array.isArray(audit?.underSelection)
    ? audit.underSelection
    : [];
  const byMap = { e2e: [], integration: [] };
  for (const f of underSelection) {
    if (f && (f.map === 'e2e' || f.map === 'integration')) byMap[f.map].push(f);
  }
  return byMap;
}

/**
 * Full remediation pass over both maps.
 *
 * @returns {{ maps: { e2e: object, integration: object },
 *             changed: boolean,
 *             summary: { e2e: Array, integration: Array } }}
 */
export function remediate({ audit, maps }) {
  const byMap = partitionFindings(audit);
  const outMaps = {};
  const summary = {};
  let changed = false;
  for (const name of MAP_NAMES) {
    const res = applyRemediation(maps[name], byMap[name]);
    outMaps[name] = res.map;
    summary[name] = res.changes;
    changed = changed || res.changed;
  }
  return { maps: outMaps, changed, summary };
}

// ---------------------------------------------------------------------------
// PR body
// ---------------------------------------------------------------------------

const PRINT_WIDTH = 80;
const TAB = '  ';

/**
 * Serialise a surface map to match the repository's committed JSON formatting
 * exactly, so a remediation diff touches only the specs that changed.
 *
 * Why hand-roll this: Prettier (the repo formatter) does NOT apply printWidth to
 * JSON arrays — it PRESERVES whatever collapse/expand state the source has. So
 * neither `JSON.stringify(map, null, 2)` (expands every array) nor an
 * all-inline printer would survive `prettier --check` matching the committed
 * file; both would also reflow untouched arrays. The committed convention is the
 * standard printWidth-80 rule: an array is inline when `<indent>"key": [...]`
 * (with its trailing comma) fits in 80 columns, else one element per line. This
 * printer reproduces that rule, and a round-trip unit test asserts byte-identity
 * against both maps so any boundary drift is caught in CI, not in a noisy diff.
 *
 * The maps are shallow (object → string | string[] | object→string[]); arrays of
 * objects (none today) always expand, matching prettier.
 *
 * @param {unknown} value
 * @param {number} indent  indent level (in TAB units) of `value` itself
 * @param {boolean} trailingComma  whether a comma follows this value in its parent
 */
export function serializeMap(value, indent = 0, trailingComma = false) {
  const pad = TAB.repeat(indent);
  const padIn = TAB.repeat(indent + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const objectItems = value.some((v) => v !== null && typeof v === 'object');
    if (!objectItems) {
      // A bare array-of-primitives (not the value of an object key). Surface maps
      // never nest arrays this way, so this is just a safe fallback — the
      // printWidth-80 inline/expand decision lives in the object-entry branch
      // below, which is the only path real map data takes.
      return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
    }
    const items = value.map(
      (v, i) => `${padIn}${serializeMap(v, indent + 1, i < value.length - 1)}`,
    );
    return `[\n${items.join(',\n')}\n${pad}]`;
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const entries = keys.map((k, i) => {
      const last = i === keys.length - 1;
      const keyPart = `${padIn}${JSON.stringify(k)}: `;
      const v = value[k];
      let rendered;
      if (
        Array.isArray(v) &&
        !v.some((x) => x !== null && typeof x === 'object')
      ) {
        const inline = `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
        const commaLen = last && !trailingComma ? 0 : 1;
        if (
          v.length > 0 &&
          keyPart.length + inline.length + commaLen > PRINT_WIDTH
        ) {
          const inner = v
            .map((x) => `${padIn}${TAB}${JSON.stringify(x)}`)
            .join(',\n');
          rendered = `[\n${inner}\n${padIn}]`;
        } else {
          rendered = inline;
        }
      } else {
        rendered = serializeMap(v, indent + 1, !last || trailingComma);
      }
      return `${keyPart}${rendered}`;
    });
    return `{\n${entries.join(',\n')}\n${pad}}`;
  }

  return JSON.stringify(value);
}

/** Serialise a top-level surface map to its committed text (trailing newline). */
export function serializeMapFile(map) {
  return `${serializeMap(map, 0, false)}\n`;
}

const MAP_FILES = {
  e2e: 'apps/web-e2e/src/e2e-surface-map.json',
  integration: 'apps/web-e2e/src/integration/integration-surface-map.json',
};

const MAP_LABELS = {
  e2e: 'e2e (hermetic)',
  integration: 'integration (live-backend)',
};

/**
 * GitHub rejects PR bodies over 65,536 characters (createPullRequest GraphQL
 * error: "Body is too long"). A large under-selection backlog (the first audit
 * flagged 103 specs / 2578 globs) renders far past that, so the body never
 * lists more than fits this ceiling — chosen with margin so wrapper text added
 * by `gh` or future edits can't tip it over the API limit.
 */
export const MAX_PR_BODY_CHARS = 60000;

/** A spec entry lists at most this many of its added globs before eliding. */
export const MAX_GLOBS_PER_SPEC = 20;

/** Reserved room for the omission note appended when entries are dropped. */
const OMISSION_NOTE_RESERVE = 400;

/** Render one spec's bullet block (spec line + capped glob lines). */
function renderSpecEntry(c) {
  const lines = [
    `- **${c.spec}**${c.onboarded ? ' _(new entry — onboarded)_' : ''}`,
  ];
  for (const g of c.added.slice(0, MAX_GLOBS_PER_SPEC)) {
    lines.push(`    - \`+ ${g}\``);
  }
  if (c.added.length > MAX_GLOBS_PER_SPEC) {
    lines.push(
      `    - _…plus ${c.added.length - MAX_GLOBS_PER_SPEC} more glob(s) — see the map diff._`,
    );
  }
  return lines;
}

/**
 * Human-reviewable PR body. Makes the additive-only / never-auto-merge contract
 * explicit, and caps itself at `maxChars` (default safely under GitHub's 64 KB
 * body limit): entries are listed in order until the budget is spent, then the
 * remainder is summarised as a count with a pointer to the nightly run — the
 * full proposal is always in the PR's map diff itself.
 */
export function renderPrBody(
  summary,
  { runUrl, maxChars = MAX_PR_BODY_CHARS } = {},
) {
  const headerLines = [
    'Automated, **additive-only** surface-map update proposed by the ' +
      'auto-remediation bot (LS-7851), closing the loop on the nightly drift ' +
      'auditor (LS-7850).',
    '',
    'The auditor observed specs exercising source files that **no surface glob ' +
      'accounted for** (under-selection — the new-source-file onboarding ' +
      'signal). This PR adds the missing globs, broadened to directory level, so ' +
      'affected specs are selected when those areas change.',
    '',
  ];

  // Leading '' keeps a blank line between the listing and the `---` rule (a
  // dash line directly under text would parse as a setext heading instead).
  const footerLines = ['', '---', '', '**Review notes**'];
  footerLines.push(
    '- This bot is **additive-only**: it never removes or narrows a glob. ' +
      'Dead-glob pruning stays a manual human decision (removing a glob risks ' +
      'silently reintroducing under-selection).',
  );
  footerLines.push(
    '- **Never auto-merged.** Review the proposed globs and merge like any PR; ' +
      'narrow them by hand first if a directory glob is broader than warranted.',
  );
  footerLines.push(
    '- Idempotent: this single standing PR is refreshed each night while the ' +
      'under-selection persists, not duplicated.',
  );
  if (runUrl) {
    footerLines.push(`- Source nightly run: ${runUrl}`);
  }
  footerLines.push('');
  const footer = footerLines.join('\n') + '\n';

  const lines = [...headerLines];
  const used = () => lines.join('\n').length + 1; // +1: '\n' before footer join

  let budgetSpent = false;
  let omittedSpecs = 0;
  let omittedGlobs = 0;

  for (const name of MAP_NAMES) {
    const changes = summary[name] ?? [];
    if (changes.length === 0) continue;
    const headingLines = [
      `### \`${MAP_FILES[name]}\` — ${MAP_LABELS[name]}`,
      '',
    ];
    let headingEmitted = false;
    for (const c of changes) {
      if (!budgetSpent) {
        const entryLines = renderSpecEntry(c);
        const pending = headingEmitted
          ? entryLines
          : [...headingLines, ...entryLines];
        const pendingLen = pending.join('\n').length + 1;
        if (
          used() + pendingLen + OMISSION_NOTE_RESERVE + footer.length <=
          maxChars
        ) {
          lines.push(...pending);
          headingEmitted = true;
          continue;
        }
        // First entry that doesn't fit — everything from here on is summarised
        // as a count, so the listing reads as "first N, remainder omitted".
        budgetSpent = true;
      }
      omittedSpecs += 1;
      omittedGlobs += c.added.length;
    }
    if (headingEmitted) lines.push('');
  }

  if (omittedSpecs > 0) {
    const fullReport = runUrl
      ? `the nightly run for the full report: ${runUrl}`
      : "the nightly run's coverage-audit log for the full report";
    lines.push(
      `> ⚠️ **${omittedSpecs} more spec(s) (${omittedGlobs} glob(s)) omitted** ` +
        "to keep this description under GitHub's 64 KB PR-body limit. " +
        `Every proposed glob is still in this PR's diff; see ${fullReport}`,
    );
    lines.push('');
  }

  let body = lines.join('\n') + footer;
  // Defensive last resort — unreachable with the default budget, but the
  // ceiling is the contract: never hand GitHub a too-long body.
  if (body.length > maxChars) {
    const marker = '\n…(truncated)\n';
    body = body.slice(0, maxChars - marker.length) + marker;
  }
  return body;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    auditJson: null,
    e2eMap: null,
    integrationMap: null,
    write: false,
    prBodyOut: null,
    runUrl: null,
    githubOutput: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--audit-json') args.auditJson = argv[++i];
    else if (a === '--e2e-map') args.e2eMap = argv[++i];
    else if (a === '--integration-map') args.integrationMap = argv[++i];
    else if (a === '--write') args.write = true;
    else if (a === '--pr-body-out') args.prBodyOut = argv[++i];
    else if (a === '--run-url') args.runUrl = argv[++i];
    else if (a === '--github-output') args.githubOutput = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.auditJson || !args.e2eMap || !args.integrationMap) {
    log('error: --audit-json, --e2e-map and --integration-map are required');
    process.exit(2);
  }

  const audit = JSON.parse(readFileSync(args.auditJson, 'utf8'));
  const maps = {
    e2e: JSON.parse(readFileSync(args.e2eMap, 'utf8')),
    integration: JSON.parse(readFileSync(args.integrationMap, 'utf8')),
  };

  const { maps: outMaps, changed, summary } = remediate({ audit, maps });

  const totalSpecs = summary.e2e.length + summary.integration.length;
  const totalGlobs =
    summary.e2e.reduce((n, c) => n + c.added.length, 0) +
    summary.integration.reduce((n, c) => n + c.added.length, 0);
  log(
    `[remediate] ${changed ? 'changes proposed' : 'no changes'} — ` +
      `${totalSpecs} spec(s), ${totalGlobs} glob(s) added across both maps.`,
  );

  if (args.write && changed) {
    // serializeMapFile reproduces the committed prettier-clean formatting exactly
    // (printWidth-80 array collapse), so the diff touches only changed specs and
    // the result already passes `prettier --check` — no post-format step needed.
    writeFileSync(args.e2eMap, serializeMapFile(outMaps.e2e));
    writeFileSync(args.integrationMap, serializeMapFile(outMaps.integration));
  }

  if (args.prBodyOut) {
    writeFileSync(
      args.prBodyOut,
      renderPrBody(summary, { runUrl: args.runUrl }),
    );
  }

  if (args.githubOutput) {
    process.stdout.write(
      [
        `changed=${changed}`,
        `spec-count=${totalSpecs}`,
        `glob-count=${totalGlobs}`,
        '',
      ].join('\n'),
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
