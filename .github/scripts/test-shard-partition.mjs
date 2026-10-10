import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * test-shard-partition.mjs — decides which Nx projects one shard of
 * ci-pipeline.yml's `test` matrix runs `typecheck test` for (LS-11028).
 *
 * WHY: the single `nx affected -t typecheck test` job took ~20 min on a
 * full-affected merge-queue batch (41 projects, Nx cache 0/84 — a batch tree is
 * a new combination of PRs, so the cache cannot help). Parallelism across jobs
 * is the lever; NX_PARALLEL / the 2 GB heap cap per job stay as they are, so a
 * shard's memory profile is no worse than today's single job.
 *
 * HOW: every project with a `typecheck` or `test` target is assigned to a
 * shard ONCE, over the WHOLE workspace — not over the affected set. Each shard
 * then runs (its projects ∩ affected). Two properties fall out of that:
 *
 *   1. No project can fall between shards. Every matrix job computes its own
 *      affected set (nx-set-shas runs per job), and for non-PR events that
 *      base is "last successful run on main", which can move between two
 *      shards' start times. Partitioning the affected set would then hand
 *      shards different lists and could silently drop a project; a fixed
 *      workspace-wide assignment cannot — a project is tested iff its owning
 *      shard sees it affected, exactly the guarantee the single job gave.
 *   2. The assignment is a pure function of the checked-out commit (project
 *      graph + tracked files), so it needs no checked-in data and every shard
 *      agrees on it without a coordinating job on the critical path.
 *
 * Balancing is greedy longest-processing-time over a cost proxy: the number of
 * tracked source files under the project root (typecheck and Jest/Vitest cost
 * both scale with it). It is tuned for the case that matters — a broad batch
 * that affects most projects; a narrow change runs few projects and is fast
 * whichever shard they land on.
 */

const SOURCE_FILE_RE = /\.(?:[cm]?[jt]sx?)$/;
const TARGETS = ['typecheck', 'test'];

/**
 * Count tracked source files per project root. A file belongs to the LONGEST
 * root that contains it, so a nested project's files never inflate its parent.
 *
 * @param {Array<{ name: string, root: string }>} projects
 * @param {string[]} trackedFiles repo-relative paths (git ls-files)
 * @returns {Map<string, number>} project name → source file count (min 1)
 */
export function sourceWeights(projects, trackedFiles) {
  const byRootLength = [...projects].sort(
    (a, b) => b.root.length - a.root.length,
  );
  const weights = new Map(projects.map((p) => [p.name, 0]));
  for (const file of trackedFiles) {
    if (!SOURCE_FILE_RE.test(file)) continue;
    const owner = byRootLength.find(
      (p) => p.root !== '.' && p.root !== '' && file.startsWith(`${p.root}/`),
    );
    if (owner) weights.set(owner.name, weights.get(owner.name) + 1);
  }
  // A project with no matching files still costs a task spin-up.
  for (const [name, w] of weights) weights.set(name, Math.max(1, w));
  return weights;
}

/**
 * Greedy LPT: heaviest project first, onto the currently lightest shard.
 * Ties break on name / lowest shard index so the result is deterministic.
 *
 * @param {Array<{ name: string, weight: number }>} projects
 * @param {number} shardCount
 * @returns {Array<{ projects: string[], weight: number }>}
 */
export function partitionProjects(projects, shardCount) {
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new Error(
      `shard count must be a positive integer, got ${shardCount}`,
    );
  }
  const shards = Array.from({ length: shardCount }, () => ({
    projects: [],
    weight: 0,
  }));
  const ordered = [...projects].sort(
    (a, b) => b.weight - a.weight || a.name.localeCompare(b.name),
  );
  for (const project of ordered) {
    let lightest = shards[0];
    for (const shard of shards)
      if (shard.weight < lightest.weight) lightest = shard;
    lightest.projects.push(project.name);
    lightest.weight += project.weight;
  }
  for (const shard of shards) shard.projects.sort();
  return shards;
}

/**
 * The projects shard `shardIndex` (1-based) must run: its assignment
 * intersected with the affected set, sorted.
 */
export function projectsForShard(shards, shardIndex, affected) {
  const shard = shards[shardIndex - 1];
  if (!shard) {
    throw new Error(`shard ${shardIndex} out of range 1..${shards.length}`);
  }
  const affectedSet = new Set(affected);
  return shard.projects.filter((name) => affectedSet.has(name));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    args[key] = argv[i + 1];
  }
  const shard = Number(args.shard);
  const total = Number(args.total);
  if (
    !Number.isInteger(shard) ||
    !Number.isInteger(total) ||
    shard < 1 ||
    shard > total
  ) {
    throw new Error(
      'usage: test-shard-partition.mjs --shard <i> --total <n> --affected <file.json>',
    );
  }
  if (!args.affected) throw new Error('--affected <file.json> is required');
  return { shard, total, affectedFile: args.affected };
}

async function main() {
  const { shard, total, affectedFile } = parseArgs(process.argv.slice(2));
  const affected = JSON.parse(readFileSync(affectedFile, 'utf8'));
  if (!Array.isArray(affected)) {
    throw new Error(`${affectedFile} must hold a JSON array of project names`);
  }

  const { createProjectGraphAsync } = await import('@nx/devkit');
  const graph = await createProjectGraphAsync({ exitOnError: true });
  const projects = Object.values(graph.nodes)
    .filter((node) => TARGETS.some((t) => node.data.targets?.[t]))
    .map((node) => ({ name: node.name, root: node.data.root }));

  const tracked = execFileSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  const weights = sourceWeights(projects, tracked);
  const shards = partitionProjects(
    projects.map((p) => ({ name: p.name, weight: weights.get(p.name) })),
    total,
  );
  const mine = projectsForShard(shards, shard, affected);

  // Diagnostics go to stderr; stdout is the comma list the workflow consumes.
  const affectedSet = new Set(affected);
  shards.forEach((s, i) => {
    const run = s.projects.filter((n) => affectedSet.has(n));
    const runWeight = run.reduce((sum, n) => sum + weights.get(n), 0);
    process.stderr.write(
      `${i + 1 === shard ? '>' : ' '} shard ${i + 1}/${total}: ` +
        `${run.length}/${s.projects.length} projects affected, ` +
        `weight ${runWeight}/${s.weight}\n`,
    );
  });
  process.stdout.write(mine.join(','));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    process.stderr.write(`test-shard-partition: ${err.message}\n`);
    process.exit(1);
  });
}
