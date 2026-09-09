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
  | { kind: 'single'; target: string }
  | { kind: 'fanout'; targets: string[]; skipped: string[] }
  | { kind: 'error'; message: string };

const JEST_EXECUTOR = '@nx/jest:jest';

// Mirrors the NX_NAME_REGEX check in run-target.ts / show-project.ts: this
// module calls `runNx` directly (not through runTarget), so it needs its own
// guard against passing an unvalidated project name to a spawned process.
const NX_NAME_REGEX = /^[a-z0-9-._]+$/i;

function isJestTarget(cfg: NxTargetConfig | undefined): boolean {
  return cfg?.executor === JEST_EXECUTOR || cfg?.options?.jestConfig != null;
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
  if (!NX_NAME_REGEX.test(project)) {
    // Don't spawn `nx show project` with an unvalidated project name —
    // fall back to "single" and let runTarget's own NX_NAME_REGEX check
    // (run-target.ts) reject it with its usual error message.
    return { kind: 'single', target: 'test' };
  }

  let projectConfig: NxProjectConfig;
  try {
    const output = await runNx(['show', 'project', project, '--json'], cwd);
    projectConfig = JSON.parse(output) as NxProjectConfig;
  } catch {
    // Can't introspect the target graph (e.g. unknown project) — fall back
    // to the pre-existing behavior rather than blocking a call that used to
    // work; `runTarget` will surface the real error.
    return { kind: 'single', target: 'test' };
  }

  const testTarget = projectConfig.targets?.test;
  const dependsOn = testTarget?.dependsOn ?? [];
  const isAggregate =
    testTarget?.executor === 'nx:noop' && dependsOn.length > 0;

  if (!isAggregate) {
    return { kind: 'single', target: 'test' };
  }

  const jestDeps = dependsOn.filter((dep) =>
    isJestTarget(projectConfig.targets?.[dep]),
  );
  const skipped = dependsOn.filter((dep) => !jestDeps.includes(dep));

  if (jestDeps.length === 0) {
    return {
      kind: 'error',
      message: `"${project}"'s "test" target is an aggregate over ${dependsOn.join(', ')}, none of which are jest targets — testPathPatterns cannot be forwarded to it. Pass config explicitly (e.g. one of: ${dependsOn.join(', ')}), or run the target directly.`,
    };
  }

  return { kind: 'fanout', targets: jestDeps, skipped };
}
