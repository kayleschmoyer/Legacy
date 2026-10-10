import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * e2e-shard-weights.mjs — refreshes the per-spec duration weights that
 * apps/web-e2e/src/integration/shard-partition.ts uses to balance the hermetic
 * e2e shards of run-playwright-tests.yml (LS-11034).
 *
 * WHY: Playwright's native `--shard` splits by test COUNT, but per-test cost
 * varies by >10× across specs, so the nightly chromium shards ran 47 / 59 /
 * 60+ min (3/3 hit the 60-min timeout at test 841/880, run 37943431617).
 * Balancing by measured duration needs durations that track the suite as it
 * grows — a hand-maintained table (the integration suite's
 * integration-shard-weights.json) goes stale.
 *
 * HOW: after every full-suite run, deploy-report feeds the merged Playwright
 * JSON report through this script. For each tracked project it sums every
 * attempt's duration per spec file (retries are real wall-clock), then folds
 * the observation into the previous weights with an exponential moving
 * average so one noisy run cannot swing the partition. The result is written
 * back to S3 (ci-artifacts/e2e-shard-weights/latest.json); build-web reads it
 * once per run and hands it to every shard, so all shards partition from the
 * same weights. The committed apps/web-e2e/src/e2e-shard-weights.json is the
 * fail-open seed for when the S3 copy has expired (3-day bucket lifecycle).
 *
 * Partial runs are safe: a spec missing from the report (e.g. its shard was
 * cancelled) keeps its previous weight. Entries are pruned only when the run
 * observed nearly every known spec for that project, i.e. it was complete and
 * the missing spec was genuinely deleted or ignored.
 *
 *   node .github/scripts/e2e-shard-weights.mjs \
 *     --report test-results.json --previous prev.json --out next.json \
 *     [--projects "chromium,Mobile Chrome"] [--run-id 123]
 */

export const DEFAULT_PROJECTS = ['chromium', 'Mobile Chrome'];
/** Weight of the newest observation in the moving average. */
export const EWMA_ALPHA = 0.5;
/** Observed share of known specs above which a run counts as complete. */
export const COMPLETE_RUN_RATIO = 0.9;
/** Default weight for a project with no observations at all. */
const FALLBACK_DEFAULT_WEIGHT = 60;

/**
 * Sum attempt durations (seconds) per spec file for each project in a
 * Playwright JSON report. Top-level suites are files; `suite.file` is relative
 * to the project's testDir, which is the same key shape `playwright test
 * --list --reporter=json` produces for the partitioner.
 *
 * @param {object} report parsed Playwright JSON report
 * @param {string[]} projects project names to collect
 * @returns {Map<string, Map<string, number>>} project → file → seconds
 */
export function collectDurations(report, projects) {
  const wanted = new Set(projects);
  /** @type {Map<string, Map<string, number>>} */
  const out = new Map(projects.map((p) => [p, new Map()]));

  const walk = (suite, file) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (!wanted.has(test.projectName)) continue;
        const ms = (test.results ?? []).reduce(
          (sum, r) => sum + (Number(r.duration) || 0),
          0,
        );
        const byFile = out.get(test.projectName);
        byFile.set(file, (byFile.get(file) ?? 0) + ms / 1000);
      }
    }
    for (const child of suite.suites ?? []) walk(child, file);
  };

  for (const top of report.suites ?? []) walk(top, top.file);
  return out;
}

function median(values) {
  if (values.length === 0) return FALLBACK_DEFAULT_WEIGHT;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Fold one run's observations into a project's previous weights.
 *
 * @param {Record<string, number>} previous spec → seconds
 * @param {Map<string, number>} observed spec → seconds (this run)
 * @returns {{ defaultWeightSeconds: number, weights: Record<string, number> }}
 */
export function mergeProjectWeights(previous, observed) {
  const prevKeys = Object.keys(previous);
  const seenKnown = prevKeys.filter((k) => observed.has(k)).length;
  const complete =
    prevKeys.length === 0 || seenKnown / prevKeys.length >= COMPLETE_RUN_RATIO;

  /** @type {Record<string, number>} */
  const next = {};
  if (!complete) {
    for (const key of prevKeys) next[key] = previous[key];
  }
  for (const [key, seconds] of observed) {
    const prev = previous[key];
    const value =
      prev === undefined
        ? seconds
        : EWMA_ALPHA * seconds + (1 - EWMA_ALPHA) * prev;
    // Floor at 1s so a spec of fully-skipped tests still costs a slot.
    next[key] = Math.max(1, Math.round(value));
  }

  const weights = Object.fromEntries(
    Object.entries(next).sort(([a], [b]) => a.localeCompare(b)),
  );
  return {
    defaultWeightSeconds: Math.round(median(Object.values(weights))),
    weights,
  };
}

/**
 * Produce the next weights manifest from the previous one and a report.
 * A project with no observed tests (e.g. the run skipped e2e) is carried over
 * unchanged.
 */
export function updateWeights({ previous, report, projects, runId }) {
  const observed = collectDurations(report, projects);
  const prevProjects = previous?.projects ?? {};
  const nextProjects = { ...prevProjects };

  for (const project of projects) {
    const seen = observed.get(project);
    if (seen.size === 0) continue;
    nextProjects[project] = mergeProjectWeights(
      prevProjects[project]?.weights ?? {},
      seen,
    );
  }

  return {
    '//': 'Per-spec duration weights (seconds, summed across tests and retries) for weighted e2e sharding (LS-11034). Seed only — the live copy is refreshed after every full-suite run by .github/scripts/e2e-shard-weights.mjs and stored in S3. Regenerate the seed from a recent report with that script.',
    updatedAt: new Date().toISOString(),
    ...(runId ? { sourceRunId: String(runId) } : {}),
    projects: nextProjects,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }
    out[arg.slice(2)] = value;
    i++;
  }
  for (const required of ['report', 'out']) {
    if (out[required] === undefined) {
      throw new Error(`Missing required flag --${required}`);
    }
  }
  return out;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function runCli(argv) {
  const args = parseArgs(argv);
  let previous = {};
  if (args.previous) {
    try {
      previous = readJson(args.previous);
    } catch (err) {
      process.stderr.write(
        `[e2e-shard-weights] ignoring unreadable previous weights ${args.previous}: ${err.message}\n`,
      );
    }
  }
  const projects = args.projects
    ? args.projects
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
    : DEFAULT_PROJECTS;

  const next = updateWeights({
    previous,
    report: readJson(args.report),
    projects,
    runId: args['run-id'],
  });
  writeFileSync(args.out, `${JSON.stringify(next, null, 2)}\n`);

  for (const project of projects) {
    const p = next.projects[project];
    if (!p) {
      process.stdout.write(`${project}: no observations, no weights\n`);
      continue;
    }
    const total = Object.values(p.weights).reduce((a, b) => a + b, 0);
    process.stdout.write(
      `${project}: ${Object.keys(p.weights).length} specs, ` +
        `${Math.round(total / 60)} test-minutes, default ${p.defaultWeightSeconds}s\n`,
    );
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    runCli(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`[e2e-shard-weights] ${err.message}\n`);
    process.exit(1);
  }
}
