import { runNx } from '../run-command.js';

/** Minimal shape of an `nx show project --json` target entry we care about. */
interface NxTargetConfig {
  executor?: string;
  dependsOn?: string[];
  options?: { jestConfig?: string };
}

interface NxProjectConfig {
  targets?: Record<string, NxTargetConfig>;
}

export type TestTargetPlan =
  | { kind: 'single'; target: string; shellJoinsArgs: boolean }
  // Fan-out targets are filtered down to jest-executor deps, which never
  // shell-join their args — so they carry no `shellJoinsArgs` flag.
  | { kind: 'fanout'; targets: string[]; skipped: string[] }
  | { kind: 'error'; message: string };

const JEST_EXECUTOR = '@nx/jest:jest';

/**
 * The one executor that joins the `--` passthrough into a shell string
 * instead of forwarding argv, losing multi-word values (LS-10153). See
 * `quoteForShellJoin` in ../shell-join-quote.ts for the full mechanism.
 */
const SHELL_JOINING_EXECUTOR = 'nx:run-script';

// Mirrors the NX_NAME_REGEX check in run-target.ts / show-project.ts: this
// module calls `runNx` directly (not through runTarget), so it needs its own
// guard against passing an unvalidated project name to a spawned process.
const NX_NAME_REGEX = /^[a-z0-9-._]+$/i;

function isJestTarget(cfg: NxTargetConfig | undefined): boolean {
  return cfg?.executor === JEST_EXECUTOR || cfg?.options?.jestConfig != null;
}

/**
 * Read a project's target map via `nx show project --json`, or null when it
 * can't be introspected (unknown project, unparseable output, or a project
 * name that failed validation — callers fall back to the pre-existing
 * behavior and let `runTarget` surface the real error).
 */
async function loadProjectTargets(
  project: string,
  cwd: string,
): Promise<Record<string, NxTargetConfig> | null> {
  if (!NX_NAME_REGEX.test(project)) {
    // Don't spawn `nx show project` with an unvalidated project name.
    return null;
  }
  try {
    const output = await runNx(['show', 'project', project, '--json'], cwd);
    return (JSON.parse(output) as NxProjectConfig).targets ?? {};
  } catch {
    return null;
  }
}

/**
 * Whether `target`'s executor joins its `--` passthrough args into one shell
 * string, requiring the caller to pre-quote multi-word values (LS-10153).
 *
 * Used by the `config` path of `runTest`, which addresses a colon-suffixed
 * target (`test:all-files`, `test:watch`, ...) directly and so never goes
 * through `resolveTestTargetPlan` — those script-backed variants are exactly
 * where `nx:run-script` shows up. Defaults to false when the project can't be
 * introspected: the unquoted form is what shipped before.
 */
export async function targetShellJoinsArgs(
  project: string,
  target: string,
  cwd: string,
): Promise<boolean> {
  const targets = await loadProjectTargets(project, cwd);
  return targets?.[target]?.executor === SHELL_JOINING_EXECUTOR;
}

/**
 * Decides how `runTest` should reach a project's jest suite(s).
 *
 * Some projects (e.g. shared-components) define `test` as an `nx:noop`
 * aggregate over config-scoped jest targets (`test:web`, `test:mobile`, ...).
 * `--testPathPatterns` forwarded straight to a noop executor is silently
 * dropped, and the dependency targets then run unfiltered — the caller gets
 * back `passed: true` having actually run the full, unscoped suite (LS-9886).
 *
 * This inspects the project's target graph (`nx show project --json`) and
 * returns a plan: run the plain `test` target as before (`single`), fan the
 * pattern out across every jest-executor dependency of an aggregate
 * (`fanout`), or fail fast when an aggregate has no jest-executor
 * dependencies to fan out to (`error`).
 */
export async function resolveTestTargetPlan(
  project: string,
  cwd: string,
): Promise<TestTargetPlan> {
  const targets = await loadProjectTargets(project, cwd);
  if (targets == null) {
    // Can't introspect the target graph (e.g. unknown project, or a name
    // that failed validation) — fall back to the pre-existing behavior
    // rather than blocking a call that used to work; `runTarget` will
    // surface the real error, and its own NX_NAME_REGEX check rejects a bad
    // project name with the usual message.
    return { kind: 'single', target: 'test', shellJoinsArgs: false };
  }

  const testTarget = targets.test;
  const dependsOn = testTarget?.dependsOn ?? [];
  const isAggregate =
    testTarget?.executor === 'nx:noop' && dependsOn.length > 0;

  if (!isAggregate) {
    return {
      kind: 'single',
      target: 'test',
      shellJoinsArgs: testTarget?.executor === SHELL_JOINING_EXECUTOR,
    };
  }

  const jestDeps = dependsOn.filter((dep) => isJestTarget(targets[dep]));
  const skipped = dependsOn.filter((dep) => !jestDeps.includes(dep));

  if (jestDeps.length === 0) {
    return {
      kind: 'error',
      message: `"${project}"'s "test" target is an aggregate over ${dependsOn.join(', ')}, none of which are jest targets — testPathPatterns cannot be forwarded to it. Pass config explicitly (e.g. one of: ${dependsOn.join(', ')}), or run the target directly.`,
    };
  }

  return { kind: 'fanout', targets: jestDeps, skipped };
}
