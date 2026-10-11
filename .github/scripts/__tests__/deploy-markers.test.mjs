/**
 * Unit tests for deploy-markers.mjs (LS-10369).
 *
 * These pin the ticket's acceptance criteria: the per-target decision for a
 * marker that is present / missing / not an ancestor of HEAD, and the
 * simulated sequence "Deploy A (lambda change) cancelled → Deploy B (docs-only
 * push) → B uploads A's lambdas" — plus the workflow wiring that keeps
 * deploy.yml, upload-lambdas.yml and lambda-drift-check.yml on this module
 * instead of a second copy of the path sets.
 *
 * Run via: node --test .github/scripts/__tests__/deploy-markers.test.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DEPLOY_TARGET_PATHS,
  NO_DRIFT_STATE,
  NO_WITHHELD_STATE,
  TARGETS,
  WITHHELD_ESCALATE_AT,
  WITHHELD_REPEAT_EVERY,
  classifyMarker,
  decideDriftAlert,
  decideTargets,
  decideWithheldStreak,
  evaluateDrift,
  filesForTarget,
  isWebWithheld,
  markersToRecord,
  matchesPattern,
  parseWithheldState,
  planMarkerWrite,
  resolveLambdaBase,
} from '../deploy-markers.mjs';

const WORKFLOWS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'workflows',
);
const workflow = (name) => readFileSync(join(WORKFLOWS, name), 'utf8');

const sha = (n) => n.toString(16).padStart(40, '0');

/**
 * In-memory linear history standing in for main. `commits[i]` is
 * `{ files, time? }`; its SHA is `sha(i + 1)`. `strays` are commits that
 * exist in the clone but are not on main (not an ancestor of anything).
 */
function fakeRepo(commits, { strays = [] } = {}) {
  const index = (s) => {
    const i = Number.parseInt(s, 16) - 1;
    return i >= 0 && i < commits.length && sha(i + 1) === s ? i : -1;
  };
  const range = (base, head) => commits.slice(index(base) + 1, index(head) + 1);
  return {
    head: () => sha(commits.length),
    push(files, time = 0) {
      commits.push({ files, time });
      return sha(commits.length);
    },
    resolve: (s) => (index(s) >= 0 || strays.includes(s) ? s : null),
    isAncestor: (a, b) =>
      index(a) >= 0 && index(b) >= 0 && index(a) <= index(b),
    changedFiles: (base, head) => [
      ...new Set(range(base, head).flatMap((c) => c.files)),
    ],
    countCommits: (base, head) => range(base, head).length,
    commitsBetween: (base, head) =>
      range(base, head).map((c) => ({
        sha: 'x',
        time: c.time ?? 0,
        files: c.files,
      })),
  };
}

const present = (value) => ({ readable: true, value });
const MISSING = { readable: true, value: '' };
const UNREADABLE = { readable: false };
const allMarkers = (read) =>
  Object.fromEntries(TARGETS.map((target) => [target, read]));

describe('target path sets', () => {
  it('matches a directory prefix and an exact file, nothing looser', () => {
    assert.equal(matchesPattern('lambdas/db/src/a.ts', 'lambdas/**'), true);
    assert.equal(matchesPattern('lambdas-old/a.ts', 'lambdas/**'), false);
    assert.equal(matchesPattern('package.json', 'package.json'), true);
    assert.equal(
      matchesPattern('apps/web/package.json', 'package.json'),
      false,
    );
  });

  it('rejects a pattern shape the matcher does not implement', () => {
    assert.throws(() => matchesPattern('a.ts', '*.ts'), /Unsupported/);
    assert.throws(() => matchesPattern('a/b/c.ts', 'a/*/**'), /Unsupported/);
  });

  it('every defined pattern is a supported shape', () => {
    for (const target of TARGETS) {
      assert.doesNotThrow(() => filesForTarget(['x'], target));
    }
  });

  it('a docs-only change belongs to no target', () => {
    for (const target of TARGETS) {
      assert.deepEqual(filesForTarget(['docs/ci-cd/README.md'], target), []);
    }
  });

  it('deploy.yml changes redeploy every target', () => {
    for (const target of TARGETS) {
      assert.ok(
        DEPLOY_TARGET_PATHS[target].includes('.github/workflows/deploy.yml'),
      );
    }
  });
});

describe('classifyMarker', () => {
  const repo = fakeRepo([{ files: [] }, { files: [] }], { strays: [sha(99)] });
  const head = repo.head();

  it('accepts an ancestor of HEAD, including HEAD itself', () => {
    assert.deepEqual(classifyMarker(present(sha(1)), head, repo), {
      status: 'ok',
      sha: sha(1),
    });
    assert.equal(classifyMarker(present(head), head, repo).status, 'ok');
  });

  it('distinguishes every unusable marker', () => {
    const status = (read) => classifyMarker(read, head, repo).status;
    assert.equal(status(MISSING), 'missing');
    assert.equal(status(UNREADABLE), 'unreadable');
    assert.equal(status(undefined), 'unreadable');
    assert.equal(status(present('initial')), 'invalid');
    assert.equal(status(present(sha(50))), 'unknown-commit');
    assert.equal(status(present(sha(99))), 'not-ancestor');
  });
});

describe('decideTargets', () => {
  const repo = fakeRepo([
    { files: ['README.md'] },
    { files: ['lambdas/db/src/schema.ts'] },
    { files: ['docs/notes.md'] },
  ]);
  const head = repo.head();
  const decide = (markers, forced) =>
    decideTargets({ markers, headSha: head, forced, git: repo });

  it('marker present: deploys only targets whose paths changed since it', () => {
    const decisions = decide(allMarkers(present(sha(1))));
    assert.deepEqual(decisions.lambdas, {
      deploy: true,
      reason: 'changed',
      marker: sha(1),
      commits: 2,
    });
    for (const target of ['terraform', 'web', 'android', 'storybook']) {
      assert.equal(decisions[target].deploy, false, target);
      assert.equal(decisions[target].reason, 'unchanged');
    }
  });

  it('marker at HEAD: nothing to deploy', () => {
    const decisions = decide(allMarkers(present(head)));
    for (const target of TARGETS) {
      assert.equal(decisions[target].deploy, false, target);
    }
  });

  it('marker missing: the target is deployed, never treated as unchanged', () => {
    const decisions = decide(allMarkers(MISSING));
    for (const target of TARGETS) {
      assert.equal(decisions[target].deploy, true, target);
      assert.equal(decisions[target].reason, 'marker-missing');
    }
  });

  it('marker not an ancestor of HEAD: the target is deployed', () => {
    const stray = fakeRepo([{ files: [] }], { strays: [sha(99)] });
    const decisions = decideTargets({
      markers: allMarkers(present(sha(99))),
      headSha: stray.head(),
      git: stray,
    });
    for (const target of TARGETS) {
      assert.equal(decisions[target].deploy, true, target);
      assert.equal(decisions[target].reason, 'marker-not-ancestor');
    }
  });

  it('marker unreadable (no IAM grant yet): the target is deployed', () => {
    const decisions = decide(allMarkers(UNREADABLE));
    for (const target of TARGETS) {
      assert.equal(decisions[target].deploy, true, target);
      assert.equal(decisions[target].reason, 'marker-unreadable');
    }
  });

  it('decides each target against its OWN marker', () => {
    const decisions = decide({
      ...allMarkers(present(head)),
      lambdas: present(sha(1)),
      web: MISSING,
    });
    assert.equal(decisions.lambdas.deploy, true);
    assert.equal(decisions.web.deploy, true);
    assert.equal(decisions.android.deploy, false);
  });

  it('force-* deploys an unchanged target; force-lambdas forces terraform too', () => {
    const decisions = decide(allMarkers(present(head)), {
      lambdas: true,
      storybook: true,
    });
    assert.equal(decisions.lambdas.reason, 'forced');
    assert.equal(decisions.terraform.reason, 'forced');
    assert.equal(decisions.storybook.reason, 'forced');
    assert.equal(decisions.web.deploy, false);
    assert.equal(decisions.android.deploy, false);
  });
});

describe('resolveLambdaBase', () => {
  const repo = fakeRepo([{ files: [] }, { files: [] }, { files: [] }], {
    strays: [sha(99)],
  });
  const head = repo.head();
  const base = (args) =>
    resolveLambdaBase({
      marker: MISSING,
      legacyMarker: MISSING,
      nxBase: '',
      headSha: head,
      git: repo,
      ...args,
    });

  it('prefers the lambdas marker over everything else', () => {
    assert.deepEqual(
      base({
        marker: present(sha(1)),
        legacyMarker: present(sha(2)),
        nxBase: sha(2),
      }),
      { base: sha(1), source: 'marker' },
    );
  });

  it('bootstraps from the LS-10366 marker when the new one is missing', () => {
    assert.deepEqual(base({ legacyMarker: present(sha(2)), nxBase: sha(1) }), {
      base: sha(2),
      source: 'legacy-marker',
    });
  });

  it('skips a marker that is unusable or already at HEAD', () => {
    for (const marker of [UNREADABLE, present(sha(99)), present(head)]) {
      assert.deepEqual(base({ marker, nxBase: sha(2) }), {
        base: sha(2),
        source: 'nx-base',
      });
    }
  });

  it('keeps the NX_BASE guards as the last fallback', () => {
    for (const nxBase of ['', 'not-a-ref', head, sha(99)]) {
      assert.deepEqual(base({ nxBase }), { base: 'HEAD~1', source: 'head~1' });
    }
  });
});

describe('markersToRecord', () => {
  const everything = Object.fromEntries(TARGETS.map((t) => [t, true]));
  const allGreen = {
    upload: 'success',
    apply: 'success',
    web: 'success',
    android: 'success',
    storybook: 'success',
  };
  const record = (args) =>
    markersToRecord({ targeted: everything, results: allGreen, ...args });

  it('records every targeted target that succeeded', () => {
    assert.deepEqual(record(), TARGETS);
  });

  it('never records a target that was not deployed', () => {
    assert.deepEqual(
      record({ targeted: { ...everything, web: false, android: false } }),
      ['lambdas', 'terraform', 'storybook'],
    );
    assert.deepEqual(
      record({
        results: {
          ...allGreen,
          web: 'failure',
          android: 'cancelled',
          storybook: 'skipped',
        },
      }),
      ['lambdas', 'terraform'],
    );
  });

  it('lambdas needs upload AND apply', () => {
    assert.ok(
      !record({ results: { ...allGreen, apply: 'failure' } }).includes(
        'lambdas',
      ),
    );
    assert.ok(
      !record({
        results: { ...allGreen, upload: 'failure', apply: 'skipped' },
      }).includes('lambdas'),
    );
    // Upload succeeded, apply was cancelled mid-run: uploaded is not deployed.
    assert.deepEqual(record({ results: { ...allGreen, apply: 'cancelled' } }), [
      'web',
      'android',
      'storybook',
    ]);
  });

  it('a terraform-only deploy (upload skipped) records terraform alone', () => {
    assert.deepEqual(
      record({
        targeted: { terraform: true },
        results: { ...allGreen, upload: 'skipped' },
      }),
      ['terraform'],
    );
  });

  it('a forced lambda deploy that uploaded nothing does not advance lambdas', () => {
    assert.ok(
      !record({ forceLambdas: true, lambdasUploaded: '' }).includes('lambdas'),
    );
    assert.ok(
      record({ forceLambdas: true, lambdasUploaded: 'db' }).includes('lambdas'),
    );
  });
});

describe('planMarkerWrite', () => {
  const repo = fakeRepo([{ files: [] }, { files: [] }, { files: [] }], {
    strays: [sha(99)],
  });
  const plan = (current, target) =>
    planMarkerWrite({ current, sha: target, git: repo });

  it('advances and counts the commits moved', () => {
    assert.deepEqual(plan(present(sha(1)), sha(3)), {
      write: true,
      reason: 'advance',
      previous: sha(1),
      advanced: 2,
    });
  });

  it('writes a first marker, or over an unusable one, with no count', () => {
    for (const current of [
      MISSING,
      UNREADABLE,
      present(sha(50)),
      present(sha(99)),
    ]) {
      const result = plan(current, sha(3));
      assert.equal(result.write, true);
      assert.equal(result.advanced, null);
    }
  });

  it('never moves a marker backwards', () => {
    assert.deepEqual(plan(present(sha(3)), sha(2)), {
      write: false,
      reason: 'newer-marker-present',
      previous: sha(3),
      advanced: null,
    });
  });

  it('is a no-op when the marker is already at the deployed SHA', () => {
    assert.equal(plan(present(sha(2)), sha(2)).reason, 'already-current');
  });
});

describe('simulated sequence: a cancelled Deploy is healed by the next one', () => {
  /** One Deploy at the repo's current HEAD; children succeed unless cancelled. */
  function deploy(repo, markers, { cancelled = false, forced } = {}) {
    const headSha = repo.head();
    const decisions = decideTargets({ markers, headSha, forced, git: repo });
    const targeted = Object.fromEntries(
      TARGETS.map((t) => [t, decisions[t].deploy]),
    );
    const lambdaBase = targeted.lambdas
      ? resolveLambdaBase({
          marker: markers.lambdas,
          legacyMarker: MISSING,
          nxBase: '',
          headSha,
          git: repo,
        }).base
      : null;
    const result = (ran) =>
      !ran ? 'skipped' : cancelled ? 'cancelled' : 'success';
    const recorded = markersToRecord({
      targeted,
      results: {
        upload: result(targeted.lambdas),
        apply: result(targeted.lambdas || targeted.terraform),
        web: result(targeted.web),
        android: result(targeted.android),
        storybook: result(targeted.storybook),
      },
    });
    const next = { ...markers };
    for (const target of recorded) {
      if (
        planMarkerWrite({ current: markers[target], sha: headSha, git: repo })
          .write
      ) {
        next[target] = present(headSha);
      }
    }
    return { targeted, lambdaBase, recorded, markers: next };
  }

  it('Deploy A (lambda change) cancelled → Deploy B (docs-only push) uploads A’s lambdas', () => {
    const repo = fakeRepo([{ files: ['README.md'] }]);
    const deployed = repo.head();
    let markers = allMarkers(present(deployed));

    // A: a lambda change merges; its Deploy is cancelled before it ships.
    const lambdaCommit = repo.push(['lambdas/stripe-webhook/src/handler.ts']);
    const a = deploy(repo, markers, { cancelled: true });
    assert.equal(a.targeted.lambdas, true);
    assert.deepEqual(a.recorded, []);
    assert.deepEqual(a.markers, markers, 'a cancelled Deploy moves no marker');
    markers = a.markers;

    // B: a docs-only push. The push range touches no target path at all…
    repo.push(['docs/ci-cd/README.md']);
    assert.deepEqual(
      filesForTarget(repo.changedFiles(lambdaCommit, repo.head()), 'lambdas'),
      [],
      'the pushed range alone would have skipped lambdas',
    );
    // …but against the marker, lambdas is still owed.
    const b = deploy(repo, markers);
    assert.equal(b.targeted.lambdas, true);
    assert.equal(b.targeted.web, false);
    assert.equal(b.lambdaBase, deployed, 'nx affected is based before A');
    assert.ok(
      repo
        .changedFiles(b.lambdaBase, repo.head())
        .includes('lambdas/stripe-webhook/src/handler.ts'),
      'the nx affected range covers A’s lambda change',
    );
    assert.deepEqual(b.recorded, ['lambdas']);
    assert.equal(b.markers.lambdas.value, repo.head());
    assert.equal(b.markers.web.value, deployed, 'untargeted markers stay put');
    markers = b.markers;

    // C: another docs-only push — nothing is owed any more.
    repo.push(['docs/more.md']);
    const c = deploy(repo, markers);
    assert.deepEqual(
      TARGETS.filter((t) => c.targeted[t]),
      [],
    );
  });

  it('a failed apply keeps lambdas owed even though the upload went green', () => {
    const repo = fakeRepo([{ files: [] }]);
    const markers = allMarkers(present(repo.head()));
    repo.push(['lambdas/db/src/schema.ts']);
    const recorded = markersToRecord({
      targeted: { lambdas: true },
      results: { upload: 'success', apply: 'failure' },
    });
    assert.deepEqual(recorded, []);
    repo.push(['docs/x.md']);
    assert.equal(
      decideTargets({ markers, headSha: repo.head(), git: repo }).lambdas
        .deploy,
      true,
    );
  });
});

describe('evaluateDrift', () => {
  const NOW = 100_000;
  const minutesAgo = (m) => NOW - m * 60;
  const repo = fakeRepo([
    { files: [], time: 0 },
    { files: ['lambdas/db/a.ts'], time: minutesAgo(200) },
    { files: ['lambdas/db/b.ts', 'apps/web/src/x.tsx'], time: minutesAgo(10) },
    { files: ['docs/x.md'], time: minutesAgo(5) },
  ]);
  const report = evaluateDrift({
    markers: {
      lambdas: present(sha(1)),
      terraform: present(sha(1)),
      web: present(sha(1)),
      android: MISSING,
      storybook: present(sha(4)),
    },
    headSha: repo.head(),
    git: repo,
    nowSeconds: NOW,
    thresholdMinutes: 60,
  });

  it('is behind once the OLDEST undeployed commit for the target is past the threshold', () => {
    assert.equal(report.lambdas.status, 'behind');
    assert.equal(report.lambdas.commits, 2);
    assert.equal(report.lambdas.ageMinutes, 200);
  });

  it('is pending while the gap is younger than the threshold', () => {
    assert.equal(report.web.status, 'pending');
    assert.equal(report.web.commits, 1);
  });

  it('ignores commits that touch none of the target’s paths', () => {
    assert.equal(report.terraform.status, 'in-sync');
    assert.equal(report.storybook.status, 'in-sync');
  });

  it('reports an unusable marker separately — the next Deploy ships that target', () => {
    assert.equal(report.android.status, 'no-marker');
    assert.equal(report.android.markerStatus, 'missing');
  });
});

describe('decideDriftAlert', () => {
  const alert = (args) => decideDriftAlert({ deployActive: 'false', ...args });

  it('posts when a target first falls behind', () => {
    assert.deepEqual(alert({ behindTargets: ['lambdas'] }), {
      post: true,
      kind: 'drift',
      reason: 'state-changed',
      nextState: 'lambdas',
    });
  });

  it('is silent on every later run with the same set behind', () => {
    const repeat = alert({
      behindTargets: ['web', 'lambdas'],
      previousState: 'lambdas,web',
    });
    assert.equal(repeat.post, false);
    assert.equal(repeat.reason, 'unchanged');
  });

  it('posts again when the set changes, and once on recovery', () => {
    assert.equal(
      alert({ behindTargets: ['lambdas', 'web'], previousState: 'lambdas' })
        .kind,
      'drift',
    );
    assert.deepEqual(alert({ behindTargets: [], previousState: 'lambdas' }), {
      post: true,
      kind: 'recovered',
      reason: 'state-changed',
      nextState: NO_DRIFT_STATE,
    });
  });

  it('is silent when nothing is behind and nothing was', () => {
    assert.equal(alert({ behindTargets: [] }).post, false);
    assert.equal(
      alert({ behindTargets: [], previousState: NO_DRIFT_STATE }).post,
      false,
    );
  });

  it('never posts — and keeps the stored state — while a Deploy is in flight or unknown', () => {
    for (const deployActive of ['true', 'unknown']) {
      const result = decideDriftAlert({
        behindTargets: ['lambdas'],
        previousState: 'web',
        deployActive,
      });
      assert.equal(result.post, false);
      assert.equal(result.nextState, 'web');
    }
  });
});

describe('workflow wiring', () => {
  it('deploy.yml takes its targets from this module, not a second path list', () => {
    const deployYml = workflow('deploy.yml');
    assert.match(deployYml, /deploy-markers\.mjs detect/);
    assert.match(deployYml, /deploy-markers\.mjs record/);
    assert.doesNotMatch(deployYml, /dorny\/paths-filter/);
    assert.doesNotMatch(deployYml, /^\s+- 'lambdas\/\*\*'/m);
  });

  it('upload-lambdas.yml bases nx affected on the module and writes no marker of its own', () => {
    const uploadYml = workflow('upload-lambdas.yml');
    assert.match(uploadYml, /deploy-markers\.mjs"? lambda-base/);
    assert.doesNotMatch(uploadYml, /Record last-uploaded SHA/);
  });

  it('lambda-drift-check.yml runs the marker drift check', () => {
    assert.match(
      workflow('lambda-drift-check.yml'),
      /deploy-markers\.mjs drift/,
    );
  });
});

describe('isWebWithheld (LS-11040)', () => {
  const base = {
    webTargeted: true,
    webResult: 'skipped',
    uploadResult: 'success',
    applyResult: 'failure',
  };

  it('a targeted web skipped behind a failed or cancelled lambda child', () => {
    assert.equal(isWebWithheld(base), true);
    assert.equal(
      isWebWithheld({
        ...base,
        uploadResult: 'cancelled',
        applyResult: 'skipped',
      }),
      true,
    );
  });

  it('not when the web was not targeted, ran, or the lambda children were fine', () => {
    assert.equal(isWebWithheld({ ...base, webTargeted: false }), false);
    assert.equal(isWebWithheld({ ...base, webResult: 'success' }), false);
    assert.equal(isWebWithheld({ ...base, webResult: 'failure' }), false);
    assert.equal(
      isWebWithheld({
        ...base,
        uploadResult: 'skipped',
        applyResult: 'success',
      }),
      false,
    );
  });
});

describe('decideWithheldStreak (LS-11040)', () => {
  const NOW = '2026-10-08T01:00:00.000Z';
  const stored = (count) => ({
    readable: true,
    value: JSON.stringify({ count, since: NOW, firstRunId: '5950' }),
  });
  const decide = (previous, withheld, webDeployed = false) =>
    decideWithheldStreak({
      previous,
      withheld,
      webDeployed,
      runId: '6000',
      nowIso: NOW,
    });

  it('the first withheld run starts a streak without escalating', () => {
    const d = decide({ readable: true, value: '' }, true);
    assert.equal(d.kind, 'first');
    assert.equal(d.post, false);
    assert.equal(d.write, true);
    assert.deepEqual(JSON.parse(d.nextState), {
      count: 1,
      since: NOW,
      firstRunId: '6000',
    });
  });

  it('the second consecutive withheld run escalates, keeping the streak origin', () => {
    const d = decide(stored(1), true);
    assert.equal(d.kind, 'escalate');
    assert.equal(d.post, true);
    assert.equal(d.streak.count, WITHHELD_ESCALATE_AT);
    assert.equal(d.streak.firstRunId, '5950');
  });

  it('re-escalates every WITHHELD_REPEAT_EVERY runs after, silent in between', () => {
    const posts = [];
    for (let prev = WITHHELD_ESCALATE_AT; prev < 45; prev += 1) {
      if (decide(stored(prev), true).post) posts.push(prev + 1);
    }
    assert.deepEqual(
      posts,
      [1, 2, 3, 4].map((n) => WITHHELD_ESCALATE_AT + n * WITHHELD_REPEAT_EVERY),
    );
  });

  it('a web deploy clears the streak and posts recovery only after an escalation', () => {
    const escalated = decide(stored(5), false, true);
    assert.equal(escalated.kind, 'recovered');
    assert.equal(escalated.post, true);
    assert.equal(escalated.nextState, NO_WITHHELD_STATE);

    const quiet = decide(stored(1), false, true);
    assert.equal(quiet.kind, 'recovered');
    assert.equal(quiet.post, false);
    assert.equal(quiet.write, true);
  });

  it('a run that neither withheld nor deployed the web leaves the streak alone', () => {
    const d = decide(stored(3), false, false);
    assert.equal(d.kind, 'unchanged');
    assert.equal(d.write, false);
    assert.equal(
      decide({ readable: true, value: 'none' }, false, true).write,
      false,
    );
  });

  it('an unreadable state with a withheld web escalates rather than staying silent', () => {
    const d = decide({ readable: false }, true);
    assert.equal(d.kind, 'escalate');
    assert.equal(d.post, true);
  });

  it('parseWithheldState treats garbage as no streak', () => {
    assert.equal(parseWithheldState('{nope').count, 0);
    assert.equal(parseWithheldState('{"count":0}').count, 0);
    assert.equal(parseWithheldState(NO_WITHHELD_STATE).count, 0);
    assert.equal(parseWithheldState('{"count":3}').count, 3);
  });

  it('deploy.yml tracks the streak in Rollup Status', () => {
    assert.match(workflow('deploy.yml'), /deploy-markers\.mjs withheld/);
  });
});
