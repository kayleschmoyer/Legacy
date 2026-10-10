/**
 * Weighted shard partition for the live-backend integration suite (LS-7845).
 *
 * Problem this solves
 * -------------------
 * The nightly workflow (`run-playwright-tests.yml`) fans the integration suite
 * out across 3 shards. Playwright's native `--shard=k/n` splits the
 * alphabetically-sorted spec-file list into `n` contiguous chunks of roughly
 * equal *test count*. With `fullyParallel: false` and `workers: 1`, that put
 * every heavy draft/season spec — `live-draft-ui`, `matchup-detail-ui`,
 * `matchup-roster-editor-ui`, `matchup-roster-recap-ui`,
 * `mock-draft-simulator-ui` — into the alphabetical *middle* third (shard 2).
 * Shard 2 then ran ~5 multi-minute live-backend flows back-to-back, saturating
 * Lambda/RDS/SQS, so latency-sensitive phases there blew their deadlines while
 * shards 1 & 3 (light specs) stayed green. The *shifting* set of failing phases
 * run-to-run is the signature of load contention, not discrete bugs — exactly
 * the "genuine backend load under sharding" case the e2e-determinism skill says
 * to fix structurally (antipattern #4), not with per-phase timeout bumps.
 *
 * Approach
 * --------
 * Replace Playwright's count-based contiguous sharding with a weight-balanced
 * partition: assign each spec a rough worst-case runtime weight
 * (`integration-shard-weights.json`) and distribute files across shards with the
 * Longest-Processing-Time (LPT) greedy bin-packing heuristic. LPT keeps the
 * per-shard total runtime within one max-weight of optimal, which in practice
 * keeps the heaviest draft/season specs on separate shards and spreads the rest
 * evenly. The workflow then passes each shard its explicit file list (no
 * `--shard`); shard identity for the cleanup guards travels via the
 * `INTEGRATION_SHARD_CURRENT` / `INTEGRATION_SHARD_TOTAL` env vars instead.
 *
 * This module is pure logic (unit-tested in `shard-partition.test.ts`) plus a
 * thin CLI used by the workflow:
 *
 *   tsx apps/web-e2e/src/integration/shard-partition.ts \
 *     --dir apps/web-e2e/src/integration/tests \
 *     --weights apps/web-e2e/src/integration/integration-shard-weights.json \
 *     --shards 3 --index 2
 *
 * It prints the spec paths assigned to shard 2 (one per line, `<dir>/<file>`),
 * ready to splat after `--` into `playwright test`.
 *
 * Hermetic e2e suite (LS-11034)
 * -----------------------------
 * The same LPT partition balances the nightly chromium and Mobile Chrome e2e
 * shards, which native count-based `--shard` left at 47 / 59 / 60+ min (3/3
 * hit the 60-min timeout). Two flags adapt it:
 *
 *   --project <name>   read `projects[<name>]` from a multi-project manifest
 *                      (`apps/web-e2e/src/e2e-shard-weights.json`, refreshed
 *                      from nightly durations by
 *                      `.github/scripts/e2e-shard-weights.mjs`).
 *   --list-json <file> take the candidate specs from
 *                      `playwright test --list --reporter=json --project=<name>`
 *                      instead of listing `--dir`. That honours the project's
 *                      `testIgnore` (Mobile Chrome skips the desktop-grid
 *                      specs) and nested dirs (`shared/*.dual.spec.ts`), so a
 *                      spec that never runs on the project cannot skew a shard.
 *                      `--dir` is then only the output path prefix.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export interface ShardWeights {
  /** Weight applied to any spec not listed in `weights`. */
  defaultWeightSeconds: number;
  /** Map of spec basename → approximate worst-case runtime in seconds. */
  weights: Record<string, number>;
}

export interface PartitionResult {
  /** `bins[i]` holds the spec basenames assigned to shard `i + 1`. */
  bins: string[][];
  /** `totals[i]` is the summed weight of `bins[i]`. */
  totals: number[];
}

/** Default weight used when the manifest omits `defaultWeightSeconds`. */
const FALLBACK_DEFAULT_WEIGHT = 90;

/**
 * Load and validate the weights manifest. The `"//"` comment key is ignored.
 * Throws if the file is missing or malformed — a silent fallback to all-default
 * weights would re-introduce the imbalance this module exists to prevent.
 */
export function loadWeights(
  weightsPath: string,
  project?: string,
): ShardWeights {
  const raw = fs.readFileSync(weightsPath, 'utf-8');
  const manifest = JSON.parse(raw) as Partial<ShardWeights> & {
    projects?: Record<string, Partial<ShardWeights>>;
  };
  // Multi-project manifest (LS-11034): one weights table per Playwright
  // project, since the same spec costs differently per viewport/browser.
  const parsed =
    project === undefined ? manifest : manifest.projects?.[project];
  const label =
    project === undefined
      ? weightsPath
      : `${weightsPath} (project "${project}")`;
  if (!parsed?.weights || typeof parsed.weights !== 'object') {
    throw new Error(
      `Shard weights manifest ${label} is missing a "weights" object.`,
    );
  }
  const defaultWeightSeconds =
    typeof parsed.defaultWeightSeconds === 'number'
      ? parsed.defaultWeightSeconds
      : FALLBACK_DEFAULT_WEIGHT;
  return { defaultWeightSeconds, weights: parsed.weights };
}

/**
 * Enumerate the spec basenames Playwright would select from `testsDir`. Matches
 * `*.spec.ts` (covers both `*.integration.spec.ts` and `*.contract.spec.ts`),
 * sorted so the result — and therefore the partition — is deterministic.
 */
export function listSpecFiles(testsDir: string): string[] {
  return fs
    .readdirSync(testsDir)
    .filter((f) => f.endsWith('.spec.ts'))
    .sort();
}

/**
 * Extract the spec files from a `playwright test --list --reporter=json`
 * report. Top-level suites are files, keyed relative to the project's testDir
 * — the same keys the e2e weights manifest uses. Sorted and de-duplicated.
 */
export function specsFromListReport(report: {
  suites?: Array<{ file?: string }>;
}): string[] {
  const files = new Set<string>();
  for (const suite of report.suites ?? []) {
    if (suite.file) files.add(suite.file.replace(/\\/g, '/'));
  }
  return [...files].sort();
}

/**
 * Distribute `specs` across `shards` bins balanced by weight (LPT greedy).
 *
 * Determinism: specs are ordered by descending weight, then ascending name, so
 * the assignment is identical across machines and runs. Each spec lands in the
 * currently-lightest bin; ties pick the lowest bin index.
 */
export function partitionSpecs(args: {
  specs: string[];
  weights: ShardWeights;
  shards: number;
}): PartitionResult {
  const { specs, weights, shards } = args;
  if (!Number.isInteger(shards) || shards < 1) {
    throw new Error(`shards must be a positive integer, got ${shards}`);
  }

  const weightOf = (spec: string): number =>
    weights.weights[spec] ?? weights.defaultWeightSeconds;

  const ordered = [...specs].sort((a, b) => {
    const diff = weightOf(b) - weightOf(a);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  const bins: string[][] = Array.from({ length: shards }, () => []);
  const totals: number[] = Array.from({ length: shards }, () => 0);

  for (const spec of ordered) {
    // Lightest bin wins; ties resolve to the lowest index for stable output.
    let target = 0;
    for (let i = 1; i < shards; i++) {
      if (totals[i] < totals[target]) target = i;
    }
    bins[target].push(spec);
    totals[target] += weightOf(spec);
  }

  // Sort each bin's contents by name so the emitted file list is stable.
  for (const bin of bins) bin.sort();

  return { bins, totals };
}

/**
 * Return the spec basenames assigned to a single 1-based shard `index` of
 * `shards`.
 */
export function shardSpecs(args: {
  specs: string[];
  weights: ShardWeights;
  shards: number;
  index: number;
}): string[] {
  const { specs, weights, shards, index } = args;
  if (!Number.isInteger(index) || index < 1 || index > shards) {
    throw new Error(`index must be an integer in [1, ${shards}], got ${index}`);
  }
  return partitionSpecs({ specs, weights, shards }).bins[index - 1];
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliArgs {
  dir: string;
  weights: string;
  shards: number;
  index: number;
  project?: string;
  listJson?: string;
}

function parseCliArgs(argv: string[]): CliArgs {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`Missing value for --${key}`);
      }
      out[key] = value;
      i++;
    }
  }
  for (const required of ['dir', 'weights', 'shards', 'index']) {
    if (out[required] === undefined) {
      throw new Error(`Missing required flag --${required}`);
    }
  }
  return {
    dir: out.dir,
    weights: out.weights,
    shards: Number(out.shards),
    index: Number(out.index),
    project: out.project,
    listJson: out['list-json'],
  };
}

function runCli(argv: string[]): void {
  const args = parseCliArgs(argv);
  const weights = loadWeights(args.weights, args.project);
  const specs = args.listJson
    ? specsFromListReport(
        JSON.parse(fs.readFileSync(args.listJson, 'utf-8')) as {
          suites?: Array<{ file?: string }>;
        },
      )
    : listSpecFiles(args.dir);
  if (specs.length === 0) {
    throw new Error('No spec files to partition.');
  }

  // Surface specs missing an explicit weight so authors know to update the
  // manifest — silent defaulting is how imbalance creeps back in.
  const unmapped = specs.filter((s) => weights.weights[s] === undefined);
  if (unmapped.length > 0) {
    process.stderr.write(
      `[shard-partition] ${unmapped.length} spec(s) without an explicit weight ` +
        `(using defaultWeightSeconds=${weights.defaultWeightSeconds}): ` +
        `${unmapped.join(', ')}\n`,
    );
  }

  const selected = shardSpecs({
    specs,
    weights,
    shards: args.shards,
    index: args.index,
  });

  // Every shard logs the whole partition, so an imbalance (or a shard whose
  // runtime drifted from its estimate) is diagnosable from any one job log.
  const { totals } = partitionSpecs({ specs, weights, shards: args.shards });
  process.stderr.write(
    `[shard-partition] ${specs.length} spec(s) → estimated weight per shard (s): ` +
      `${totals.map((t, i) => `${i + 1}=${Math.round(t)}`).join(', ')}\n`,
  );

  const dir = args.dir.replace(/[/\\]+$/, '');
  for (const spec of selected) {
    process.stdout.write(`${dir}/${spec}\n`);
  }
}

// Run the CLI only when invoked directly (not when imported by the unit test).
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    runCli(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(
      `[shard-partition] ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}
