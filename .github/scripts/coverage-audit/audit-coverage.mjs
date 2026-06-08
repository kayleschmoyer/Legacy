#!/usr/bin/env node
/**
 * Surface-map drift auditor (LS-7850, detection child of LS-7848
 * "coverage-driven surface-map auto-sync").
 *
 * Consumes the per-shard `spec→files` coverage fragments produced by the nightly
 * Playwright run (LS-7849), unions them across the matrix, and diffs the observed
 * coverage against BOTH maintained surface maps:
 *   - apps/web-e2e/src/integration/integration-surface-map.json (live-backend)
 *   - apps/web-e2e/src/e2e-surface-map.json                     (hermetic, LS-7846)
 *
 * Two drift signals, with deliberately asymmetric confidence:
 *
 *   UNDER-SELECTION (HIGH) — a spec executed a source file that NONE of its
 *     surface globs (nor the map's runAllWhenChanged safety net) account for.
 *     This is the new-source-file onboarding trigger: the PR-time presence lint
 *     only gates new *specs*, not new *source files*, so a brand-new file in a
 *     previously-unmapped area first becomes visible here once a spec exercises
 *     it. Flagged immediately — a single night is authoritative because "this
 *     spec touched this file" is a positive observation, not an absence.
 *
 *   DEAD GLOB (LOW) — a surface glob matched none of the files its spec executed.
 *     Absence of coverage is NOT proof a glob is dead: data-dependent paths
 *     routinely under-cover on any given night (a draft spec that didn't reach a
 *     trade modal, a season spec whose fixture lacked playoffs, etc.). So a glob
 *     is only reported after it has missed for K *consecutive* nightlies; the
 *     per-glob miss counter is persisted across runs (in S3, by the workflow) and
 *     reset to zero the moment the glob matches again. Dead-glob detection is
 *     scoped to per-spec surface globs only — runAllWhenChanged entries are not
 *     spec-attributed and so cannot be judged dead from coverage.
 *
 * This auditor is REPORT-ONLY: it never mutates a surface map and never fails a
 * PR (the auto-remediation PR bot is LS-7851, a separate downstream child). It
 * emits a Markdown report (for the job summary), a compact Discord description
 * (appended to the nightly thread), and an updated state file.
 *
 * The glob engine (globToRegExp / matchesAny) is shared with the integration
 * spec selector so map semantics stay identical across selection and audit.
 *
 * Usage:
 *   node audit-coverage.mjs \
 *     --fragments-dir <dir>            # tree containing per-shard coverage-fragment.json files
 *     --e2e-map <path> --integration-map <path> \
 *     [--state-in <path>] --state-out <path> \
 *     [--k <int>]                      # consecutive-miss threshold for dead globs (default 3)
 *     [--report-md <path>] [--discord-md <path>] [--json <path>] \
 *     [--github-output]                # print key=value lines to stdout for $GITHUB_OUTPUT
 *
 * All progress logging goes to stderr so stdout stays clean for --github-output.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { matchesAny } from '../integration-select/select-specs.mjs';

const MERGED_FRAGMENT_FILE = 'coverage-fragment.json';
const DEFAULT_K = 3;
const STATE_VERSION = 1;

const log = (...args) => console.error(...args);

// ---------------------------------------------------------------------------
// Fragment loading + union
// ---------------------------------------------------------------------------

/** Recursively collect every `coverage-fragment.json` path under `dir`. */
export function findFragmentFiles(dir) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found; // directory absent — no coverage collected
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      found.push(...findFragmentFiles(full));
    } else if (name === MERGED_FRAGMENT_FILE) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Union an array of fragment objects ({ specs: { spec: [files] } }) into a
 * single Map<spec, Set<file>>. Defensive against malformed fragments.
 */
export function unionFragments(fragments) {
  const bySpec = new Map();
  for (const frag of fragments) {
    const specs = frag && typeof frag === 'object' ? frag.specs : undefined;
    if (!specs || typeof specs !== 'object') continue;
    for (const [spec, files] of Object.entries(specs)) {
      if (!Array.isArray(files)) continue;
      let set = bySpec.get(spec);
      if (!set) {
        set = new Set();
        bySpec.set(spec, set);
      }
      for (const f of files) if (typeof f === 'string') set.add(f);
    }
  }
  return bySpec;
}

/** Read + parse the merged fragments found under `dir` (best-effort per file). */
export function loadFragments(dir) {
  const files = findFragmentFiles(dir);
  const fragments = [];
  for (const file of files) {
    try {
      fragments.push(JSON.parse(readFileSync(file, 'utf8')));
    } catch (err) {
      log(`[audit] skipping unreadable fragment ${file}: ${err.message}`);
    }
  }
  return { fragments, fragmentFileCount: files.length };
}

// ---------------------------------------------------------------------------
// File-set → directory-glob collapse
// ---------------------------------------------------------------------------

/**
 * Collapse a set of repo-relative files to a sorted, de-duplicated list of
 * directory globs (`<dir>/**`). Used to suggest map entries for under-selected
 * files without proposing a glob per individual file.
 */
export function collapseToDirGlobs(files) {
  const dirs = new Set();
  for (const f of files) {
    const dir = path.posix.dirname(f.split(path.sep).join('/'));
    dirs.add(dir === '.' ? '**' : `${dir}/**`);
  }
  return [...dirs].sort();
}

// ---------------------------------------------------------------------------
// Spec → map routing
// ---------------------------------------------------------------------------

/** Which surface map owns a spec, by its path. Integration is checked first. */
export function classifySpec(spec) {
  if (spec.includes('/integration/tests/')) return 'integration';
  if (spec.includes('/src/tests/')) return 'e2e';
  return null;
}

// ---------------------------------------------------------------------------
// Drift detection
// ---------------------------------------------------------------------------

/**
 * @typedef {{ runAllWhenChanged?: string[], specs: Record<string, string[]> }} SurfaceMap
 * @typedef {{ e2e: SurfaceMap, integration: SurfaceMap }} Maps
 */

/**
 * Under-selection: per spec, the observed files matched by neither the spec's
 * own surface globs nor the map's runAllWhenChanged safety net. Specs absent
 * from their map are reported with their full observed file set (no globs).
 *
 * @returns {Array<{ map: 'e2e'|'integration', spec: string, mapped: boolean, files: string[], suggestedGlobs: string[] }>}
 */
export function detectUnderSelection(observed, maps) {
  const findings = [];
  for (const [spec, fileSet] of observed) {
    const mapName = classifySpec(spec);
    if (!mapName) continue; // spec outside both known suites — not auditable here
    const map = maps[mapName];
    const specGlobs = map.specs[spec];
    const runAll = map.runAllWhenChanged ?? [];
    const mapped = Array.isArray(specGlobs);
    const allowed = mapped ? [...specGlobs, ...runAll] : runAll;
    const unmatched = [...fileSet]
      .filter((f) => !matchesAny(f, allowed))
      .sort();
    if (unmatched.length > 0) {
      findings.push({
        map: mapName,
        spec,
        mapped,
        files: unmatched,
        suggestedGlobs: collapseToDirGlobs(unmatched),
      });
    }
  }
  return findings.sort((a, b) =>
    a.map === b.map ? a.spec.localeCompare(b.spec) : a.map.localeCompare(b.map),
  );
}

/**
 * Dead globs: per-spec surface globs that matched none of the files the spec
 * executed THIS run, accumulated across runs. A glob is only evaluated for a
 * spec that produced coverage this run (so a spec that simply didn't run accrues
 * nothing). Counters for globs that matched are reset to 0; counters for globs/
 * specs no longer present in the map are pruned.
 *
 * @param {Map<string, Set<string>>} observed
 * @param {Maps} maps
 * @param {object|undefined} prevState
 * @param {number} k consecutive-miss threshold to flag
 * @returns {{ findings: Array<{map, spec, glob, consecutiveMisses}>, nextState: object }}
 */
export function detectDeadGlobs(observed, maps, prevState, k) {
  const prevCounters = prevState?.deadGlobCounters ?? {};
  const nextCounters = { e2e: {}, integration: {} };
  const findings = [];

  for (const mapName of ['e2e', 'integration']) {
    const map = maps[mapName];
    const prevForMap = prevCounters[mapName] ?? {};
    for (const [spec, globs] of Object.entries(map.specs)) {
      const observedFiles = observed.get(spec);
      const prevForSpec = prevForMap[spec] ?? {};
      const nextForSpec = {};
      for (const glob of globs) {
        if (!observedFiles) {
          // Spec did not run this night — carry the counter forward unchanged.
          if (typeof prevForSpec[glob] === 'number') {
            nextForSpec[glob] = prevForSpec[glob];
          }
          continue;
        }
        const alive = [...observedFiles].some((f) => matchesAny(f, [glob]));
        if (alive) {
          nextForSpec[glob] = 0;
        } else {
          const count = (prevForSpec[glob] ?? 0) + 1;
          nextForSpec[glob] = count;
          if (count >= k) {
            findings.push({
              map: mapName,
              spec,
              glob,
              consecutiveMisses: count,
            });
          }
        }
      }
      if (Object.keys(nextForSpec).length > 0) {
        nextCounters[mapName][spec] = nextForSpec;
      }
    }
  }

  findings.sort((a, b) =>
    a.map === b.map
      ? a.spec === b.spec
        ? a.glob.localeCompare(b.glob)
        : a.spec.localeCompare(b.spec)
      : a.map.localeCompare(b.map),
  );

  return {
    findings,
    nextState: { version: STATE_VERSION, k, deadGlobCounters: nextCounters },
  };
}

/** Run the full audit. Returns findings + the state to persist + counts. */
export function auditCoverage({ fragments, maps, prevState, k }) {
  const observed = unionFragments(fragments);
  const underSelection = detectUnderSelection(observed, maps);
  const { findings: deadGlobs, nextState } = detectDeadGlobs(
    observed,
    maps,
    prevState,
    k,
  );
  let observedFileRefs = 0;
  for (const set of observed.values()) observedFileRefs += set.size;
  return {
    underSelection,
    deadGlobs,
    nextState,
    observedSpecCount: observed.size,
    observedFileRefs,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** Full Markdown report for the GitHub Actions job summary. */
export function renderReport(result, { k }) {
  const { underSelection, deadGlobs, observedSpecCount } = result;
  const lines = [];
  lines.push('## Surface-Map Coverage Audit (LS-7850)');
  lines.push('');
  lines.push(
    `Observed coverage for **${observedSpecCount}** spec(s) across the nightly matrix. ` +
      `This report is non-blocking — no map was mutated and no PR was failed.`,
  );
  lines.push('');

  lines.push(
    `### 🔴 Under-selection — ${underSelection.length} spec(s) (HIGH signal)`,
  );
  lines.push('');
  if (underSelection.length === 0) {
    lines.push('None — every covered file is accounted for by a surface glob.');
  } else {
    lines.push(
      'A spec executed source files matched by none of its surface globs ' +
        '(nor `runAllWhenChanged`). These are likely new source files that need ' +
        'a map entry — the new-file onboarding trigger.',
    );
    lines.push('');
    for (const f of underSelection) {
      lines.push(
        `- **${f.spec}** _(${f.map} map${f.mapped ? '' : ', spec not yet mapped'})_`,
      );
      for (const file of f.files) lines.push(`    - \`${file}\``);
      lines.push(
        `    - suggested globs: ${f.suggestedGlobs.map((g) => `\`${g}\``).join(', ')}`,
      );
    }
  }
  lines.push('');

  lines.push(
    `### 🟡 Dead globs — ${deadGlobs.length} glob(s) (LOW signal, ≥${k} consecutive misses)`,
  );
  lines.push('');
  if (deadGlobs.length === 0) {
    lines.push(
      `None reached the ${k}-night threshold. Data-dependent paths under-cover, ` +
        'so a single miss is never authoritative.',
    );
  } else {
    lines.push(
      'A surface glob has matched no covered file for the listed number of ' +
        'consecutive nightlies. Consider whether the glob is stale.',
    );
    lines.push('');
    for (const f of deadGlobs) {
      lines.push(
        `- \`${f.glob}\` in **${f.spec}** _(${f.map} map)_ — ${f.consecutiveMisses} consecutive misses`,
      );
    }
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

/** Compact Discord description (kept well under Discord's 4096-char limit). */
export function renderDiscord(result, { k }) {
  const { underSelection, deadGlobs, observedSpecCount } = result;
  const lines = [];
  lines.push('**Surface-Map Coverage Audit**');
  lines.push(`Observed ${observedSpecCount} spec(s).`);
  lines.push('');
  if (underSelection.length === 0) {
    lines.push('🔴 Under-selection: none');
  } else {
    lines.push(
      `🔴 **Under-selection: ${underSelection.length} spec(s)** (HIGH — likely new source files):`,
    );
    for (const f of underSelection.slice(0, 8)) {
      const specName = f.spec.split('/').pop();
      lines.push(
        `• \`${specName}\` (+${f.files.length}): ${f.suggestedGlobs.slice(0, 3).join(', ')}`,
      );
    }
    if (underSelection.length > 8) {
      lines.push(`• …and ${underSelection.length - 8} more (see job summary)`);
    }
  }
  lines.push('');
  if (deadGlobs.length === 0) {
    lines.push(`🟡 Dead globs: none (≥${k}-night threshold)`);
  } else {
    lines.push(
      `🟡 **Dead globs: ${deadGlobs.length}** (≥${k} consecutive misses):`,
    );
    for (const f of deadGlobs.slice(0, 8)) {
      lines.push(`• \`${f.glob}\` (${f.spec.split('/').pop()})`);
    }
    if (deadGlobs.length > 8) {
      lines.push(`• …and ${deadGlobs.length - 8} more (see job summary)`);
    }
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    fragmentsDir: null,
    e2eMap: null,
    integrationMap: null,
    stateIn: null,
    stateOut: null,
    k: DEFAULT_K,
    reportMd: null,
    discordMd: null,
    json: null,
    githubOutput: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fragments-dir') args.fragmentsDir = argv[++i];
    else if (a === '--e2e-map') args.e2eMap = argv[++i];
    else if (a === '--integration-map') args.integrationMap = argv[++i];
    else if (a === '--state-in') args.stateIn = argv[++i];
    else if (a === '--state-out') args.stateOut = argv[++i];
    else if (a === '--k') args.k = Number(argv[++i]);
    else if (a === '--report-md') args.reportMd = argv[++i];
    else if (a === '--discord-md') args.discordMd = argv[++i];
    else if (a === '--json') args.json = argv[++i];
    else if (a === '--github-output') args.githubOutput = true;
  }
  return args;
}

function readJsonOrNull(file) {
  if (!file) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.fragmentsDir || !args.e2eMap || !args.integrationMap) {
    log('error: --fragments-dir, --e2e-map and --integration-map are required');
    process.exit(2);
  }
  const k = Number.isFinite(args.k) && args.k > 0 ? args.k : DEFAULT_K;

  const maps = {
    e2e: JSON.parse(readFileSync(args.e2eMap, 'utf8')),
    integration: JSON.parse(readFileSync(args.integrationMap, 'utf8')),
  };
  const { fragments, fragmentFileCount } = loadFragments(args.fragmentsDir);
  log(`[audit] loaded ${fragmentFileCount} coverage fragment file(s).`);

  const prevState = readJsonOrNull(args.stateIn);
  const result = auditCoverage({ fragments, maps, prevState, k });

  log(
    `[audit] ${result.observedSpecCount} spec(s), ${result.observedFileRefs} file ref(s); ` +
      `${result.underSelection.length} under-selection, ${result.deadGlobs.length} dead glob(s).`,
  );

  if (args.stateOut) {
    writeFileSync(
      args.stateOut,
      `${JSON.stringify(result.nextState, null, 2)}\n`,
    );
  }
  if (args.reportMd) {
    writeFileSync(args.reportMd, renderReport(result, { k }));
  }
  if (args.discordMd) {
    writeFileSync(args.discordMd, renderDiscord(result, { k }));
  }
  if (args.json) {
    writeFileSync(
      args.json,
      `${JSON.stringify(
        {
          underSelection: result.underSelection,
          deadGlobs: result.deadGlobs,
          observedSpecCount: result.observedSpecCount,
          observedFileRefs: result.observedFileRefs,
        },
        null,
        2,
      )}\n`,
    );
  }
  if (args.githubOutput) {
    process.stdout.write(
      [
        `under-selection-count=${result.underSelection.length}`,
        `dead-glob-count=${result.deadGlobs.length}`,
        `observed-spec-count=${result.observedSpecCount}`,
        `has-under-selection=${result.underSelection.length > 0}`,
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
