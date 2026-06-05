#!/usr/bin/env node
/**
 * scripts/detect-stalled-prs.mjs
 *
 * Detect "stalled" PRs: green + bot-approved but stuck in mergeable_state="blocked"
 * (GraphQL mergeStateStatus: BLOCKED) with the merge queue logging a 405
 * "N of 8 required status checks are expected" — even though every required check
 * is green. The PR sits indefinitely because nothing re-triggers it: the SHA never
 * changes, and GitHub's poisoned, cached per-commit merge verdict only recomputes
 * when a fresh check event lands on a new SHA.
 *
 * Full failure-mode writeup, root cause (cached merge verdict from "Protect Main"
 * ruleset integration_id drift), evidence, and remedy:
 *   docs/ci-cd/ci-troubleshooting-guide.md
 *     → "Failure mode: 'stalled' PRs — green + bot-approved but merge-blocked"
 *
 * WHAT MAKES A PR "STALLED" (the discriminating signature) — ALL must hold:
 *   1. mergeable_state == "blocked"   (REST; GraphQL mergeStateStatus == BLOCKED)
 *   2. mergeable == true              (no merge conflict, GitHub finished computing)
 *   3. every required check-run's latest conclusion == "success":
 *        - the 5  "🚀 CI Pipeline / *" contexts
 *        - "No Merge Conflicts"
 *        - "Verify All Migrations Applied"
 *   4. the "bot-review" commit status == "success"
 * With required-approving-review-count 0, required_review_thread_resolution false,
 * and strict_required_status_checks_policy false, nothing legitimate can hold a
 * fully-green PR in "blocked" — so this signature is highly discriminating.
 *
 * This is REST-only on purpose (no GraphQL → dodges the stricter GraphQL rate
 * limits when sweeping many PRs). It reads through the authenticated `gh` CLI, so
 * no token handling lives here.
 *
 * Usage:
 *   node scripts/detect-stalled-prs.mjs                 # scan, print a report
 *   node scripts/detect-stalled-prs.mjs --json          # machine-readable output
 *   node scripts/detect-stalled-prs.mjs --repo owner/n  # override repo (default: gh repo view)
 *   node scripts/detect-stalled-prs.mjs --fix           # bump the SHA on each stalled PR
 *                                                        #   (PUT .../update-branch) to bust the
 *                                                        #   cached verdict — see remedy in the doc
 *
 * Exit codes: 0 = no stalled PRs found; 1 = one or more stalled PRs found;
 *             2 = a fatal error (gh missing / not authenticated / bad repo).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// --- Required-check matchers (the 7 contexts that gate a merge) ---
const CI_PIPELINE_PREFIX = '🚀 CI Pipeline /';
const EXPECTED_CI_PIPELINE_COUNT = 5;
const NAMED_REQUIRED_CHECKS = [
  'No Merge Conflicts',
  'Verify All Migrations Applied',
];
const BOT_REVIEW_CONTEXT = 'bot-review';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const AS_JSON = flag('--json');
const DO_FIX = flag('--fix');

/**
 * Call `gh api <path>` and parse the JSON response.
 * With `paginate`, `gh --slurp` wraps each page in an outer array. Plain-array
 * endpoints (pulls, statuses) flatten with `.flat()`; enveloped endpoints
 * (check-runs returns `{ total_count, check_runs: [...] }`) need `listKey` to
 * pull the list out of each page object before flattening.
 */
async function gh(path, { method, paginate, listKey } = {}) {
  const argv = ['api'];
  if (method) argv.push('--method', method);
  if (paginate) argv.push('--paginate', '--slurp');
  argv.push(path);
  const { stdout } = await execFileAsync('gh', argv, {
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(stdout);
  if (paginate && Array.isArray(parsed)) {
    return listKey
      ? parsed.flatMap((page) => page?.[listKey] ?? [])
      : parsed.flat();
  }
  return parsed;
}

async function resolveRepo() {
  const override = opt('--repo') || process.env.REPO;
  if (override) return override;
  const { stdout } = await execFileAsync('gh', [
    'repo',
    'view',
    '--json',
    'nameWithOwner',
    '-q',
    '.nameWithOwner',
  ]);
  return stdout.trim();
}

/** Reduce a check-runs list to the latest run per check name. */
function latestByName(checkRuns) {
  const latest = new Map();
  for (const run of checkRuns) {
    const prev = latest.get(run.name);
    // Prefer the most recently started run; fall back to the higher id.
    const newer =
      !prev ||
      new Date(run.started_at || 0) > new Date(prev.started_at || 0) ||
      (run.started_at === prev.started_at && run.id > prev.id);
    if (newer) latest.set(run.name, run);
  }
  return latest;
}

/** Reduce a commit-statuses list to the latest status per context. */
function latestStatusByContext(statuses) {
  const latest = new Map();
  for (const s of statuses) {
    const prev = latest.get(s.context);
    if (
      !prev ||
      new Date(s.updated_at || s.created_at || 0) >
        new Date(prev.updated_at || prev.created_at || 0)
    ) {
      latest.set(s.context, s);
    }
  }
  return latest;
}

/**
 * Classify one PR. Returns { stalled, allGreen, reasons[], detail{} }.
 * `reasons` explains why a PR is NOT stalled (i.e. it is a genuine block or still pending).
 */
async function classifyPr(repo, number) {
  // Detail view carries mergeable / mergeable_state. `mergeable` may be null on the
  // first read while GitHub recomputes the merge — re-GET once before trusting it.
  let pr = await gh(`repos/${repo}/pulls/${number}`);
  if (pr.mergeable === null) {
    await new Promise((r) => setTimeout(r, 2000));
    pr = await gh(`repos/${repo}/pulls/${number}`);
  }

  const sha = pr.head.sha;
  const reasons = [];

  const checkRuns = await gh(
    `repos/${repo}/commits/${sha}/check-runs?per_page=100`,
    {
      paginate: true,
      listKey: 'check_runs',
    },
  );
  const latestChecks = latestByName(checkRuns);

  const statuses = await gh(
    `repos/${repo}/commits/${sha}/statuses?per_page=100`,
    { paginate: true },
  );
  const latestStatuses = latestStatusByContext(statuses);

  // 1) The 5 "🚀 CI Pipeline / *" contexts must all be present and green.
  const ciPipeline = [...latestChecks.values()].filter((r) =>
    r.name.startsWith(CI_PIPELINE_PREFIX),
  );
  const ciGreen = ciPipeline.filter((r) => r.conclusion === 'success');
  if (ciPipeline.length < EXPECTED_CI_PIPELINE_COUNT) {
    reasons.push(
      `only ${ciPipeline.length}/${EXPECTED_CI_PIPELINE_COUNT} CI Pipeline checks present`,
    );
  } else if (ciGreen.length < ciPipeline.length) {
    reasons.push(
      `${ciPipeline.length - ciGreen.length} CI Pipeline check(s) not success`,
    );
  }

  // 2) The two named required checks must be green.
  for (const name of NAMED_REQUIRED_CHECKS) {
    const run = latestChecks.get(name);
    if (!run) reasons.push(`required check "${name}" missing`);
    else if (run.conclusion !== 'success')
      reasons.push(
        `required check "${name}" = ${run.conclusion ?? run.status}`,
      );
  }

  // 3) bot-review commit status must be success.
  const botReview = latestStatuses.get(BOT_REVIEW_CONTEXT);
  if (!botReview) reasons.push(`"${BOT_REVIEW_CONTEXT}" status missing`);
  else if (botReview.state !== 'success')
    reasons.push(`"${BOT_REVIEW_CONTEXT}" = ${botReview.state}`);

  const allGreen = reasons.length === 0;

  // 4) Merge-state gates.
  if (pr.mergeable === false)
    reasons.push('mergeable=false (dirty / conflict)');
  if (pr.mergeable_state !== 'blocked')
    reasons.push(`mergeable_state=${pr.mergeable_state} (not "blocked")`);

  const stalled =
    allGreen && pr.mergeable === true && pr.mergeable_state === 'blocked';

  return {
    number,
    title: pr.title,
    sha,
    stalled,
    allGreen,
    mergeable: pr.mergeable,
    mergeable_state: pr.mergeable_state,
    reasons,
  };
}

/** Bump the SHA via update-branch to bust the cached merge verdict. */
async function bumpSha(repo, number) {
  await gh(`repos/${repo}/pulls/${number}/update-branch`, { method: 'PUT' });
}

async function main() {
  // Fail fast and loud if gh is unusable.
  try {
    await execFileAsync('gh', ['auth', 'status']);
  } catch {
    console.error(
      'ERROR: `gh` is not installed or not authenticated. Run `gh auth login` first.',
    );
    process.exit(2);
  }

  const repo = await resolveRepo();
  if (!AS_JSON)
    console.error(
      `==> Scanning open PRs in ${repo} for the stalled-verdict signature...`,
    );

  const openPrs = await gh(`repos/${repo}/pulls?state=open&per_page=100`, {
    paginate: true,
  });

  const results = [];
  for (const pr of openPrs) {
    try {
      results.push(await classifyPr(repo, pr.number));
    } catch (err) {
      results.push({
        number: pr.number,
        title: pr.title,
        error: String(err?.message ?? err),
      });
    }
  }

  const stalled = results.filter((r) => r.stalled);

  if (DO_FIX && stalled.length) {
    for (const r of stalled) {
      try {
        await bumpSha(repo, r.number);
        r.fixed = true;
      } catch (err) {
        r.fixError = String(err?.message ?? err);
      }
    }
  }

  if (AS_JSON) {
    console.log(
      JSON.stringify(
        { repo, scanned: results.length, stalled: stalled.length, results },
        null,
        2,
      ),
    );
  } else {
    for (const r of results) {
      if (r.error) {
        console.error(`  #${r.number} — ERROR: ${r.error}`);
      } else if (r.stalled) {
        const fixNote = r.fixed
          ? ' [SHA bumped]'
          : r.fixError
            ? ` [bump FAILED: ${r.fixError}]`
            : '';
        console.error(
          `  ⛔ STALLED  #${r.number} ${r.title} (${r.sha.slice(0, 7)})${fixNote}`,
        );
      }
    }
    console.error('');
    console.error(
      `==> Scanned ${results.length} open PR(s); ${stalled.length} stalled.`,
    );
    if (stalled.length && !DO_FIX) {
      console.error(
        '    Remedy: bump the SHA on each stalled PR to recompute the merge verdict against the',
      );
      console.error('    now-clean ruleset. Re-run with --fix, or for one PR:');
      for (const r of stalled) {
        console.error(
          `      gh api repos/${repo}/pulls/${r.number}/update-branch --method PUT`,
        );
      }
      console.error(
        '    (dismiss_stale_reviews_on_push will re-run CI + re-approval automatically.)',
      );
    }
  }

  process.exit(stalled.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`FATAL: ${err?.stack ?? err}`);
  process.exit(2);
});
