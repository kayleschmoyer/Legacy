#!/usr/bin/env node
/**
 * Per-target last-deployed markers for the umbrella Deploy workflow (LS-10369).
 *
 * Deploy used to be stateless: deploy.yml decided what to ship from the pushed
 * range alone, so a Deploy that was cancelled (routine — `deploy-main` keeps
 * one running and one pending run, and a third merge cancels the pending one)
 * or failed dropped its changes for good unless a later push happened to touch
 * the same paths. On 2026-10-01 that left 13 lambda-affecting commits on main
 * and not deployed, behind a green Deploy.
 *
 * Each target now has a marker in SSM holding the SHA it was last deployed
 * from:
 *
 *   /legacy-sports/<stage>/deploy/last-deployed/<target>
 *
 * and this module owns every decision made from them:
 *
 *   detect       deploy.yml `Detect Deploy Targets` — a target is deployed when
 *                its paths changed over `<marker>..HEAD`. A marker that is
 *                missing, unreadable, or not an ancestor of HEAD means the
 *                target IS deployed, never that it is unchanged.
 *   lambda-base  upload-lambdas.yml — the `nx affected` base is the lambdas
 *                marker; NX_BASE and its HEAD~1 guards are the fallback only.
 *   record       deploy.yml `Rollup Status` — advance the marker of every
 *                target whose deploy succeeded (lambdas: upload AND apply).
 *   drift        lambda-drift-check.yml — is a marker behind main for its
 *                target's paths for too long with no Deploy in flight?
 *   withheld     deploy.yml `Rollup Status` — count consecutive Deploys that
 *                withheld Deploy Web behind a failed lambda child, and say
 *                when that streak must escalate (LS-11040).
 *
 * Because a marker only moves on success, any later Deploy of any kind picks
 * up whatever a cancelled or failed one dropped.
 *
 * The decision functions are pure and take a `git` adapter, so the tests drive
 * them against an in-memory history. Runbook: docs/ci-cd/deploy-markers.md.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Which paths belong to which deploy target — the single definition, read by
 * `detect` and `drift` alike (it used to live in deploy.yml as a
 * dorny/paths-filter block). Patterns are a `dir/**` prefix or an exact file.
 */
export const DEPLOY_TARGET_PATHS = {
  lambdas: [
    'lambdas/**',
    'lib/**',
    'tools/mcp/**',
    'tools/vite-configs/**',
    '.github/workflows/upload-lambdas.yml',
    '.github/workflows/lambda-terraform-apply.yml',
    '.github/workflows/deploy.yml',
  ],
  // Infrastructure-only signal (LS-9871). Kept SEPARATE from `lambdas` on
  // purpose: a terraform-only change ships no new lambda code, so forcing it
  // through `lambdas` would rebuild and re-upload all 18 lambda bundles to
  // produce zero new SSM versions. Scoped to terraform/main/** because that is
  // the only state lambda-terraform-apply.yml touches; terraform/runners/** has
  // its own workflow (runner-terraform-apply.yml).
  terraform: [
    'terraform/main/**',
    '.github/workflows/lambda-terraform-apply.yml',
    '.github/workflows/deploy.yml',
  ],
  web: [
    'apps/web/**',
    'lib/shared-components/**',
    '.github/workflows/deploy-web.yml',
    '.github/workflows/deploy.yml',
  ],
  android: [
    'apps/app/**',
    'lib/shared-components/**',
    'lib/ui-abstractions/**',
    'lib/utils/**',
    'lib/api/**',
    'lib/analytics/**',
    'lib/websocket-client/**',
    'lib/tamagui-config/**',
    'package.json',
    'pnpm-lock.yaml',
    '.github/workflows/build-android-app.yml',
    '.github/workflows/deploy.yml',
  ],
  storybook: [
    'lib/shared-components/**',
    '.github/workflows/deploy-storybook.yml',
    '.github/workflows/deploy.yml',
  ],
};

export const TARGETS = Object.keys(DEPLOY_TARGET_PATHS);

/** Minutes a marker may trail main before `drift` reports it. */
export const DEFAULT_STALE_MINUTES = 60;

/** Value stored in the drift alert-state parameter when nothing is behind. */
export const NO_DRIFT_STATE = 'none';

export const markerParam = (stage, target) =>
  `/legacy-sports/${stage}/deploy/last-deployed/${target}`;

/**
 * LS-10366's upload-only marker. Read as a one-time bootstrap for the lambdas
 * marker (so the first run after this change does not fall back to HEAD~1);
 * nothing writes it any more.
 */
export const legacyLambdaMarkerParam = (stage) =>
  `/legacy-sports/${stage}/deploy/lambdas-last-uploaded-sha`;

export const driftStateParam = (stage) =>
  `/legacy-sports/${stage}/deploy/marker-drift/alerted-targets`;

/**
 * Consecutive-withheld-web streak (LS-11040), as JSON
 * `{ count, since, firstRunId }`, or NO_WITHHELD_STATE when the web is caught
 * up. Under the same `/legacy-sports/<stage>/*` PutParameter grant as the
 * markers.
 */
export const webWithheldStateParam = (stage) =>
  `/legacy-sports/${stage}/deploy/web-withheld/streak`;

export const NO_WITHHELD_STATE = 'none';

/** The streak length that escalates, and how often it re-escalates after. */
export const WITHHELD_ESCALATE_AT = 2;
export const WITHHELD_REPEAT_EVERY = 10;

export function matchesPattern(file, pattern) {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -2);
    if (prefix.includes('*')) {
      throw new Error(`Unsupported deploy target pattern: ${pattern}`);
    }
    return file.startsWith(prefix);
  }
  if (pattern.includes('*')) {
    throw new Error(`Unsupported deploy target pattern: ${pattern}`);
  }
  return file === pattern;
}

export function filesForTarget(files, target) {
  const patterns = DEPLOY_TARGET_PATHS[target];
  return files.filter((file) => patterns.some((p) => matchesPattern(file, p)));
}

/**
 * Classify a raw marker read against HEAD.
 *
 * @param {{ readable: boolean, value?: string }} read
 * @returns {{ status: 'ok'|'missing'|'unreadable'|'invalid'|'unknown-commit'|'not-ancestor', sha: string|null }}
 *   Only `ok` may be used as a diff base.
 */
export function classifyMarker(read, headSha, git) {
  if (!read || !read.readable) return { status: 'unreadable', sha: null };
  const value = (read.value ?? '').trim();
  if (!value) return { status: 'missing', sha: null };
  if (!/^[0-9a-f]{7,40}$/i.test(value)) return { status: 'invalid', sha: null };
  const sha = git.resolve(value);
  if (!sha) return { status: 'unknown-commit', sha: null };
  if (!git.isAncestor(sha, headSha)) return { status: 'not-ancestor', sha };
  return { status: 'ok', sha };
}

/**
 * Decide which targets this Deploy ships.
 *
 * @param {object} args
 * @param {Record<string, { readable: boolean, value?: string }>} args.markers
 * @param {string} args.headSha
 * @param {Record<string, boolean>} [args.forced] the force-* dispatch inputs,
 *   keyed lambdas | web | android | storybook
 * @returns {Record<string, { deploy: boolean, reason: string, marker: string|null, commits: number|null }>}
 */
export function decideTargets({ markers, headSha, forced = {}, git }) {
  // force-lambdas forces the terraform apply too, so the manual
  // `gh workflow run deploy.yml -f force-lambdas=true` escape hatch keeps
  // applying infrastructure exactly as it did before LS-9871.
  const isForced = { ...forced, terraform: Boolean(forced.lambdas) };
  const decisions = {};
  for (const target of TARGETS) {
    const marker = classifyMarker(markers[target], headSha, git);
    const usable = marker.status === 'ok';
    const commits = usable ? git.countCommits(marker.sha, headSha) : null;
    let deploy;
    let reason;
    if (isForced[target]) {
      deploy = true;
      reason = 'forced';
    } else if (!usable) {
      deploy = true;
      reason = `marker-${marker.status}`;
    } else {
      const changed = filesForTarget(
        git.changedFiles(marker.sha, headSha),
        target,
      );
      deploy = changed.length > 0;
      reason = deploy ? 'changed' : 'unchanged';
    }
    decisions[target] = { deploy, reason, marker: marker.sha, commits };
  }
  return decisions;
}

/**
 * Base for upload-lambdas.yml's `nx affected`.
 *
 * The lambdas marker wins; a marker equal to HEAD says nothing is pending and
 * is skipped so a manual re-run still builds something. NX_BASE (the last
 * successful workflow run, from nrwl/nx-set-shas) keeps its pre-existing
 * guards: unset, unresolvable, equal to HEAD, or not an ancestor of HEAD (two
 * quick merges can hand back a newer run's SHA, and `nx affected` then dies on
 * "bad object") all fall back to HEAD~1.
 *
 * @returns {{ base: string, source: 'marker'|'legacy-marker'|'nx-base'|'head~1' }}
 */
export function resolveLambdaBase({
  marker,
  legacyMarker,
  nxBase,
  headSha,
  git,
}) {
  const candidates = [
    ['marker', marker],
    ['legacy-marker', legacyMarker],
  ];
  for (const [source, read] of candidates) {
    const classified = classifyMarker(read, headSha, git);
    if (classified.status === 'ok' && classified.sha !== headSha) {
      return { base: classified.sha, source };
    }
  }
  const resolved = nxBase ? git.resolve(nxBase) : null;
  if (resolved && resolved !== headSha && git.isAncestor(resolved, headSha)) {
    return { base: resolved, source: 'nx-base' };
  }
  return { base: 'HEAD~1', source: 'head~1' };
}

/**
 * Which targets' markers a finished Deploy may advance.
 *
 * @param {object} args
 * @param {Record<string, boolean>} args.targeted detect-changes outputs
 * @param {{ upload: string, apply: string, web: string, android: string, storybook: string }} args.results
 *   child job results (success | failure | cancelled | skipped)
 * @param {boolean} [args.forceLambdas]
 * @param {string} [args.lambdasUploaded] upload-lambdas' `uploaded` output
 * @returns {string[]}
 */
export function markersToRecord({
  targeted,
  results,
  forceLambdas = false,
  lambdasUploaded = '',
}) {
  const ok = (result) => result === 'success';
  const done = {
    // Upload alone is not "deployed": the new code is live only once the apply
    // has pointed the functions at it. A forced deploy that uploaded nothing
    // shipped nothing (LS-10366) and must not move the marker either.
    lambdas:
      ok(results.upload) &&
      ok(results.apply) &&
      !(forceLambdas && !lambdasUploaded),
    terraform: ok(results.apply),
    web: ok(results.web),
    android: ok(results.android),
    storybook: ok(results.storybook),
  };
  return TARGETS.filter((target) => targeted[target] && done[target]);
}

/**
 * Whether to write `sha` over the current marker value, and how far that
 * moves it. A marker never moves backwards: a slower, older run finishing
 * after a newer one leaves the newer SHA in place.
 *
 * @returns {{ write: boolean, reason: string, previous: string|null, advanced: number|null }}
 */
export function planMarkerWrite({ current, sha, git }) {
  const value = (current?.value ?? '').trim();
  const previous = value ? git.resolve(value) : null;
  if (previous === sha) {
    return { write: false, reason: 'already-current', previous, advanced: 0 };
  }
  if (previous && git.isAncestor(sha, previous)) {
    return {
      write: false,
      reason: 'newer-marker-present',
      previous,
      advanced: null,
    };
  }
  const advanced =
    previous && git.isAncestor(previous, sha)
      ? git.countCommits(previous, sha)
      : null;
  return { write: true, reason: 'advance', previous, advanced };
}

/**
 * How far each target's marker trails `headSha` (main) for that target's own
 * paths. `behind` once the oldest undeployed commit is older than the
 * threshold, `pending` before that.
 *
 * @returns {Record<string, { status: 'in-sync'|'pending'|'behind'|'no-marker', marker: string|null, commits: number, ageMinutes: number|null, markerStatus: string }>}
 */
export function evaluateDrift({
  markers,
  headSha,
  git,
  nowSeconds,
  thresholdMinutes = DEFAULT_STALE_MINUTES,
}) {
  const report = {};
  for (const target of TARGETS) {
    const marker = classifyMarker(markers[target], headSha, git);
    if (marker.status !== 'ok') {
      // Nothing to measure against — and the next Deploy treats this target
      // as changed, so it is not silently stale.
      report[target] = {
        status: 'no-marker',
        marker: marker.sha,
        commits: 0,
        ageMinutes: null,
        markerStatus: marker.status,
      };
      continue;
    }
    const undeployed = git
      .commitsBetween(marker.sha, headSha)
      .filter((commit) => filesForTarget(commit.files, target).length > 0);
    if (undeployed.length === 0) {
      report[target] = {
        status: 'in-sync',
        marker: marker.sha,
        commits: 0,
        ageMinutes: null,
        markerStatus: 'ok',
      };
      continue;
    }
    const oldest = Math.min(...undeployed.map((commit) => commit.time));
    const ageMinutes = Math.max(0, Math.floor((nowSeconds - oldest) / 60));
    report[target] = {
      status: ageMinutes > thresholdMinutes ? 'behind' : 'pending',
      marker: marker.sha,
      commits: undeployed.length,
      ageMinutes,
      markerStatus: 'ok',
    };
  }
  return report;
}

/**
 * State-change-only alerting: post when the SET of behind targets differs
 * from the one last alerted on (including going back to empty — the recovery
 * post). An unchanged set is silent, as is any check made while a Deploy is
 * queued or running (it may be about to close the gap) or while that cannot
 * be determined.
 *
 * @param {object} args
 * @param {string[]} args.behindTargets
 * @param {string} [args.previousState] stored state, '' when never written
 * @param {'true'|'false'|'unknown'} args.deployActive
 * @returns {{ post: boolean, kind: 'drift'|'recovered'|null, reason: string, nextState: string }}
 */
export function decideDriftAlert({
  behindTargets,
  previousState = '',
  deployActive,
}) {
  const previous = previousState.trim() || NO_DRIFT_STATE;
  if (deployActive !== 'false') {
    return {
      post: false,
      kind: null,
      reason:
        deployActive === 'true' ? 'deploy-in-progress' : 'deploy-state-unknown',
      nextState: previous,
    };
  }
  const nextState = [...behindTargets].sort().join(',') || NO_DRIFT_STATE;
  if (nextState === previous) {
    return { post: false, kind: null, reason: 'unchanged', nextState };
  }
  return {
    post: true,
    kind: nextState === NO_DRIFT_STATE ? 'recovered' : 'drift',
    reason: 'state-changed',
    nextState,
  };
}

/**
 * Did this Deploy withhold Deploy Web (LS-11040)? deploy.yml's deploy-web `if`
 * blocks the web when Upload Lambdas or Apply Lambda Infrastructure failed or
 * was cancelled. A partial apply can still have moved Lambda code forward, so
 * the backend may now be ahead of the web client.
 *
 * @param {{ webTargeted: boolean, webResult: string, uploadResult: string, applyResult: string }} args
 */
export function isWebWithheld({
  webTargeted,
  webResult,
  uploadResult,
  applyResult,
}) {
  const blocked = (result) => result === 'failure' || result === 'cancelled';
  return (
    Boolean(webTargeted) &&
    webResult === 'skipped' &&
    (blocked(uploadResult) || blocked(applyResult))
  );
}

/** Parse the stored streak; anything unparseable reads as no streak. */
export function parseWithheldState(raw) {
  const empty = { count: 0, since: null, firstRunId: null };
  const value = (raw ?? '').trim();
  if (!value || value === NO_WITHHELD_STATE) return empty;
  try {
    const parsed = JSON.parse(value);
    const count = Number(parsed?.count);
    if (!Number.isInteger(count) || count < 1) return empty;
    return {
      count,
      since: parsed.since ?? null,
      firstRunId: parsed.firstRunId ?? null,
    };
  } catch {
    return empty;
  }
}

/**
 * Advance the withheld-web streak and decide whether to escalate.
 *
 * The run's own Discord summary already reports a withheld web on every run;
 * this adds the escalation the per-run summary cannot give: a SECOND
 * consecutive withheld Deploy (and every WITHHELD_REPEAT_EVERY after) posts a
 * deploy-health alert, and the first web deploy after an escalated streak
 * posts the recovery. A Deploy that did not target the web leaves the streak
 * alone — it says nothing about the skew. An unreadable state with a withheld
 * web escalates: a repeated alert beats a swallowed one.
 *
 * @param {object} args
 * @param {{ readable: boolean, value?: string }} args.previous
 * @param {boolean} args.withheld
 * @param {boolean} args.webDeployed Deploy Web succeeded in this run
 * @param {string} args.runId
 * @param {string} args.nowIso
 * @returns {{ kind: 'first'|'repeat'|'escalate'|'recovered'|'unchanged', post: boolean, write: boolean, nextState: string, streak: { count: number, since: string|null, firstRunId: string|null } }}
 */
export function decideWithheldStreak({
  previous,
  withheld,
  webDeployed,
  runId,
  nowIso,
}) {
  const readable = previous?.readable !== false;
  const prev = parseWithheldState(readable ? previous?.value : '');
  if (withheld) {
    const streak = {
      count: prev.count + 1,
      since: prev.count > 0 ? prev.since : nowIso,
      firstRunId: prev.count > 0 ? prev.firstRunId : String(runId),
    };
    const due =
      streak.count === WITHHELD_ESCALATE_AT ||
      (streak.count > WITHHELD_ESCALATE_AT &&
        (streak.count - WITHHELD_ESCALATE_AT) % WITHHELD_REPEAT_EVERY === 0);
    const escalate = due || !readable;
    return {
      kind: escalate ? 'escalate' : streak.count === 1 ? 'first' : 'repeat',
      post: escalate,
      write: true,
      nextState: JSON.stringify(streak),
      streak,
    };
  }
  if (webDeployed && prev.count > 0) {
    return {
      kind: 'recovered',
      post: prev.count >= WITHHELD_ESCALATE_AT,
      write: true,
      nextState: NO_WITHHELD_STATE,
      streak: prev,
    };
  }
  return {
    kind: 'unchanged',
    post: false,
    write: false,
    nextState: readable ? (previous?.value ?? '') : '',
    streak: prev,
  };
}

// ---------------------------------------------------------------------------
// CLI — git / SSM plumbing around the decisions above.
// ---------------------------------------------------------------------------

const log = (...args) => console.error(...args);
const short = (sha) => (sha ? sha.slice(0, 8) : '—');

function run(cmd, args) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

const lines = (text) => text.split('\n').filter(Boolean);

export const realGit = {
  resolve(ref) {
    try {
      return run('git', [
        'rev-parse',
        '--verify',
        '--quiet',
        `${ref}^{commit}`,
      ]).trim();
    } catch {
      return null;
    }
  },
  isAncestor(ancestor, descendant) {
    try {
      run('git', ['merge-base', '--is-ancestor', ancestor, descendant]);
      return true;
    } catch {
      return false;
    }
  },
  changedFiles(base, head) {
    return lines(run('git', ['diff', '--name-only', base, head]));
  },
  countCommits(base, head) {
    return Number(run('git', ['rev-list', '--count', `${base}..${head}`]));
  },
  commitsBetween(base, head) {
    const out = run('git', [
      'log',
      '--format=%x01%H %ct',
      '--name-only',
      `${base}..${head}`,
    ]);
    return out
      .split('\x01')
      .filter(Boolean)
      .map((chunk) => {
        const [header, ...files] = lines(chunk);
        const [sha, time] = header.split(' ');
        return { sha, time: Number(time), files };
      });
  },
};

const stage = () => process.env.AWS_STAGE || 'dev';
const region = () => process.env.AWS_REGION || 'us-east-1';

/**
 * Read one parameter. "Not found" is a readable, empty marker; anything else
 * (no credentials, AccessDenied before the IAM grant is applied, throttling)
 * is unreadable — callers treat both as "deploy the target".
 */
function readParam(name) {
  try {
    const value = run('aws', [
      'ssm',
      'get-parameter',
      '--name',
      name,
      '--query',
      'Parameter.Value',
      '--output',
      'text',
      '--region',
      region(),
    ]).trim();
    return { readable: true, value };
  } catch (error) {
    const stderr = String(error.stderr ?? error.message ?? '');
    if (stderr.includes('ParameterNotFound')) {
      return { readable: true, value: '' };
    }
    log(`Could not read ${name}: ${lines(stderr)[0] ?? 'unknown error'}`);
    return { readable: false };
  }
}

function writeParam(name, value) {
  run('aws', [
    'ssm',
    'put-parameter',
    '--name',
    name,
    '--value',
    value,
    '--type',
    'String',
    '--overwrite',
    '--region',
    region(),
  ]);
}

const readMarkers = () =>
  Object.fromEntries(
    TARGETS.map((target) => [target, readParam(markerParam(stage(), target))]),
  );

function emit(file, text) {
  if (file) appendFileSync(file, text);
  else process.stdout.write(text);
}
const setOutput = (key, value) =>
  emit(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
const setMultilineOutput = (key, value) =>
  emit(
    process.env.GITHUB_OUTPUT,
    `${key}<<DEPLOY_MARKERS_EOF\n${value}\nDEPLOY_MARKERS_EOF\n`,
  );
const summary = (rows) =>
  emit(process.env.GITHUB_STEP_SUMMARY, `${rows.join('\n')}\n`);

const TITLES = {
  lambdas: 'Lambdas',
  terraform: 'Terraform',
  web: 'Web',
  android: 'Android',
  storybook: 'Storybook',
};

const REASONS = {
  forced: 'forced by dispatch input',
  changed: 'paths changed since marker',
  unchanged: 'no path changes since marker',
  'marker-missing': 'no marker yet — deploying',
  'marker-unreadable': 'marker unreadable — deploying',
  'marker-invalid': 'marker is not a SHA — deploying',
  'marker-unknown-commit': 'marker commit unknown — deploying',
  'marker-not-ancestor': 'marker is not an ancestor of HEAD — deploying',
};

function cmdDetect() {
  const headSha = realGit.resolve('HEAD');
  const forced = {
    lambdas: process.env.FORCE_LAMBDAS === 'true',
    web: process.env.FORCE_WEB === 'true',
    android: process.env.FORCE_ANDROID === 'true',
    storybook: process.env.FORCE_STORYBOOK === 'true',
  };
  let decisions;
  try {
    decisions = decideTargets({
      markers: readMarkers(),
      headSha,
      forced,
      git: realGit,
    });
  } catch (error) {
    // Fail open: an undecidable run deploys everything rather than nothing.
    log(
      `::warning::Marker detection failed (${error.message}) — deploying every target`,
    );
    decisions = Object.fromEntries(
      TARGETS.map((target) => [
        target,
        {
          deploy: true,
          reason: 'marker-unreadable',
          marker: null,
          commits: null,
        },
      ]),
    );
  }

  const rows = [
    '## 🎯 Deploy Targets',
    '',
    `Compared against each target's last-deployed marker (HEAD \`${short(headSha)}\`).`,
    '',
    '| Target | Affected | Why | Last deployed | Commits since |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const target of TARGETS) {
    const { deploy, reason, marker, commits } = decisions[target];
    setOutput(target, String(deploy));
    log(`${target}: ${deploy} (${reason}, marker ${short(marker)})`);
    rows.push(
      `| ${TITLES[target]} | ${deploy} | ${REASONS[reason] ?? reason} | ${marker ? `\`${short(marker)}\`` : '—'} | ${commits ?? '—'} |`,
    );
  }
  summary(rows);
}

function cmdLambdaBase() {
  const headSha = realGit.resolve('HEAD');
  const { base, source } = resolveLambdaBase({
    marker: readParam(markerParam(stage(), 'lambdas')),
    legacyMarker: readParam(legacyLambdaMarkerParam(stage())),
    nxBase: process.env.NX_BASE || '',
    headSha,
    git: realGit,
  });
  log(
    `nx affected base: ${base} (source: ${source}, NX_BASE was ${process.env.NX_BASE || 'unset'})`,
  );
  process.stdout.write(`${base}\n`);
}

function cmdRecord() {
  const sha = process.env.DEPLOY_SHA || realGit.resolve('HEAD');
  const targeted = Object.fromEntries(
    TARGETS.map((target) => [
      target,
      process.env[`${target.toUpperCase()}_TARGETED`] === 'true',
    ]),
  );
  const onMain = process.env.GITHUB_REF === 'refs/heads/main';
  const toRecord = onMain
    ? markersToRecord({
        targeted,
        results: {
          upload: process.env.UPLOAD_RESULT,
          apply: process.env.APPLY_RESULT,
          web: process.env.WEB_RESULT,
          android: process.env.ANDROID_RESULT,
          storybook: process.env.STORYBOOK_RESULT,
        },
        forceLambdas: process.env.FORCE_LAMBDAS === 'true',
        lambdasUploaded: process.env.LAMBDAS_UPLOADED || '',
      })
    : [];

  const rows = [
    '## 📍 Last-Deployed Markers',
    '',
    `This run deployed \`${short(sha)}\`. A marker moves only when its target's deploy succeeded.`,
    '',
    '| Target | Marker | This run |',
    '| --- | --- | --- |',
  ];
  for (const target of TARGETS) {
    const name = markerParam(stage(), target);
    const current = readParam(name);
    const currentSha = current.readable && current.value ? current.value : null;
    let marker = currentSha;
    let note;
    if (!toRecord.includes(target)) {
      note = targeted[target]
        ? 'not advanced — deploy did not succeed'
        : 'not targeted';
    } else {
      const plan = planMarkerWrite({ current, sha, git: realGit });
      if (!plan.write) {
        note =
          plan.reason === 'already-current'
            ? 'redeployed (marker already at this SHA)'
            : 'not moved — a newer deploy already recorded';
      } else {
        try {
          writeParam(name, sha);
          marker = sha;
          note =
            plan.advanced === null
              ? 'set (no usable previous marker)'
              : `advanced ${plan.advanced} commit${plan.advanced === 1 ? '' : 's'} from \`${short(plan.previous)}\``;
        } catch (error) {
          // A stale marker only makes the next Deploy ship more, never less.
          log(
            `::warning::Could not write ${name}: ${lines(String(error.stderr ?? error.message))[0]}`,
          );
          note = '⚠️ deployed, but the marker write failed';
        }
      }
    }
    log(`${target}: ${short(marker)} — ${note}`);
    rows.push(
      `| ${TITLES[target]} | ${marker ? `\`${short(marker)}\`` : '—'} | ${note} |`,
    );
  }
  summary(rows);
}

function cmdDrift() {
  const headSha = realGit.resolve('HEAD');
  const thresholdMinutes =
    Number(process.env.STALE_MINUTES) || DEFAULT_STALE_MINUTES;
  const dryRun = process.env.DRY_RUN === 'true';
  const report = evaluateDrift({
    markers: readMarkers(),
    headSha,
    git: realGit,
    nowSeconds: Math.floor(Date.now() / 1000),
    thresholdMinutes,
  });
  const behindTargets = TARGETS.filter((t) => report[t].status === 'behind');
  const stateName = driftStateParam(stage());
  const previous = readParam(stateName);
  const decision = decideDriftAlert({
    behindTargets,
    previousState: previous.readable ? previous.value : '',
    deployActive: process.env.DEPLOY_ACTIVE || 'unknown',
  });

  const rows = [
    '## 📍 Deploy Marker Drift',
    '',
    `main is at \`${short(headSha)}\`; threshold ${thresholdMinutes} min; Deploy in progress: ${process.env.DEPLOY_ACTIVE || 'unknown'}.`,
    '',
    '| Target | Marker | Undeployed commits | Oldest (min) | Status |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const target of TARGETS) {
    const r = report[target];
    const status =
      r.status === 'no-marker' ? `no-marker (${r.markerStatus})` : r.status;
    rows.push(
      `| ${TITLES[target]} | ${r.marker ? `\`${short(r.marker)}\`` : '—'} | ${r.commits} | ${r.ageMinutes ?? '—'} | ${status} |`,
    );
  }
  rows.push(
    '',
    `Alert decision: ${decision.post ? decision.kind : 'silent'} (${decision.reason}).`,
  );
  summary(rows);

  const post = decision.post && !dryRun;
  if (post) {
    try {
      writeParam(stateName, decision.nextState);
    } catch (error) {
      // Post anyway: a repeated alert beats a swallowed one.
      log(
        `::warning::Could not write ${stateName}: ${lines(String(error.stderr ?? error.message))[0]}`,
      );
    }
  }
  setOutput('post', String(post));
  setOutput('kind', decision.kind ?? '');
  setMultilineOutput(
    'report',
    behindTargets
      .map(
        (t) =>
          `- **${TITLES[t]}**: ${report[t].commits} undeployed commit(s), oldest ${report[t].ageMinutes} min ago (marker \`${short(report[t].marker)}\`)`,
      )
      .join('\n'),
  );
}

function cmdWithheld() {
  const onMain = process.env.GITHUB_REF === 'refs/heads/main';
  const withheld = isWebWithheld({
    webTargeted: process.env.WEB_TARGETED === 'true',
    webResult: process.env.WEB_RESULT,
    uploadResult: process.env.UPLOAD_RESULT,
    applyResult: process.env.APPLY_RESULT,
  });
  setOutput('withheld', String(withheld));
  if (!onMain) {
    setOutput('post', 'false');
    log('Not on main — withheld-web streak not tracked.');
    return;
  }
  const name = webWithheldStateParam(stage());
  const runId = process.env.GITHUB_RUN_ID || 'unknown';
  const decision = decideWithheldStreak({
    previous: readParam(name),
    withheld,
    webDeployed: process.env.WEB_RESULT === 'success',
    runId,
    nowIso: new Date().toISOString(),
  });
  if (decision.write) {
    try {
      writeParam(name, decision.nextState);
    } catch (error) {
      // Post anyway; the next run re-reads whatever is stored.
      log(
        `::warning::Could not write ${name}: ${lines(String(error.stderr ?? error.message))[0]}`,
      );
    }
  }

  const { count, since, firstRunId } = decision.streak;
  const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const repo = process.env.GITHUB_REPOSITORY || '';
  const runLink = (id) =>
    repo && id ? `[${id}](${server}/${repo}/actions/runs/${id})` : `${id}`;
  let message;
  if (decision.kind === 'recovered') {
    message = `Web deployed again after ${count} consecutive Deploy run(s) withheld it (since ${since ?? 'unknown'}, first run ${runLink(firstRunId)}). Web and backend are back in step.`;
  } else if (withheld) {
    message = [
      `**Web NOT deployed for ${count} consecutive Deploy run(s)** (since ${since ?? 'unknown'}, first run ${runLink(firstRunId)}).`,
      'Upload Lambdas or Apply Lambda Infrastructure keeps failing, so Deploy Web is withheld (deploy.yml, LS-9374). A partial Terraform apply can still ship Lambda code, so the backend may be ahead of the web client (LS-11040).',
      'Fix the lambda child; the next green Deploy ships the web. Runbook: docs/ci-cd/deploy-markers.md#withheld-web-deploys-ls-11040.',
    ].join('\n');
  } else {
    message = '';
  }
  summary([
    '## 🚧 Withheld Web Deploys',
    '',
    `This run: ${withheld ? '**web withheld**' : 'web not withheld'}. Streak: ${count}${decision.kind === 'recovered' ? ' (now cleared)' : ''}. Alert: ${decision.post ? decision.kind : 'none'}.`,
  ]);
  setOutput('post', String(decision.post));
  setOutput('kind', decision.kind);
  setOutput('count', String(count));
  setMultilineOutput('message', message);
}

const COMMANDS = {
  detect: cmdDetect,
  'lambda-base': cmdLambdaBase,
  record: cmdRecord,
  drift: cmdDrift,
  withheld: cmdWithheld,
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const command = COMMANDS[process.argv[2]];
  if (!command) {
    log(`Usage: deploy-markers.mjs <${Object.keys(COMMANDS).join('|')}>`);
    process.exit(2);
  }
  command();
}
