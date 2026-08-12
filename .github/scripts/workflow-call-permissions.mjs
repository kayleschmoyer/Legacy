#!/usr/bin/env node
/**
 * workflow-call-permissions.mjs (LS-9381)
 *
 * Asserts that every local reusable-workflow call site grants a superset of the
 * callee's declared top-level permissions.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-08-12, LS-9378 added `statuses: read` to the top-level permissions
 * block of .github/workflows/upload-lambdas.yml without adding it to the only
 * caller (.github/workflows/deploy.yml). A called workflow cannot request a
 * permission scope the calling job withholds, so GitHub refused to start the
 * entire Deploy run: it concluded `startup_failure` with ZERO jobs and the
 * message "This run likely failed because of a workflow file issue". All
 * main-branch deploys were down until LS-9380 added the grant to the caller.
 *
 * The change passed every existing gate. Two independent blind spots:
 *   1. deploy.yml triggers only on `push: [main]` and workflow_dispatch, so PR
 *      CI never STARTS the Deploy workflow — the break is unobservable until
 *      after merge.
 *   2. validate-workflows / pc-workflows validates each workflow file against
 *      its JSON schema independently. The change was schema-valid. Caller/callee
 *      permission compatibility across a workflow_call boundary is enforced only
 *      by GitHub at run start.
 *
 * This is the "invisible to PR CI, breaks main" shape that custom-checks exists
 * for, so the compatibility rule is asserted statically here instead.
 *
 * WHAT IS AND IS NOT CHECKED
 * --------------------------
 * Checked: `uses:` values pointing at a local `./.github/workflows/*.yml`.
 * Skipped: composite actions (`./.github/actions/**`) and third-party actions —
 *   they use a different permission model with no workflow_call boundary.
 * Skipped (reported, never a violation): any call site whose effective grant is
 *   not statically knowable — NEITHER the calling job NOR the calling workflow
 *   declares a `permissions:` block (the repo/org default GITHUB_TOKEN
 *   permissions apply, which the workflow files do not record), or a block is
 *   present but written as an expression. Asserting against an unknown grant
 *   would produce false positives that block every PR in the repo, so these are
 *   informational only.
 *
 * Permission inheritance follows GitHub's rule: a job with no explicit
 * `permissions:` inherits the workflow-level block. Scope levels are ordered
 * none < read < write, so a `write` grant satisfies a `read` requirement while
 * `none` satisfies nothing but `none`.
 *
 * Usage:
 *   node .github/scripts/workflow-call-permissions.mjs [--advisory] [--json]
 *
 *   --advisory  Report violations but always exit 0. Used during rollout so a
 *               false positive cannot block every PR in the repo before the
 *               inheritance logic is proven against the real workflow set.
 *   --json      Emit the machine-readable result instead of the human report.
 *
 * Exit codes:
 *   0  — clean (or violations found while --advisory is set)
 *   1  — at least one call site is missing a scope (blocking mode only)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOWS_DIR = path.join(ROOT, '.github', 'workflows');

/**
 * Permission levels in ascending order of privilege. A grant satisfies a
 * requirement when its rank is >= the requirement's rank, which is what makes
 * `write` satisfy `read` and `none` satisfy nothing above `none`.
 */
const LEVEL_RANK = Object.freeze({ none: 0, read: 1, write: 2 });

// ---------------------------------------------------------------------------
// Pure, testable helpers
// ---------------------------------------------------------------------------

/** Number of leading spaces on a raw line. */
function indentOf(rawLine) {
  return rawLine.length - rawLine.trimStart().length;
}

/**
 * Strips a trailing `# comment` from a workflow line.
 *
 * Permission blocks are plain `scope: level` scalars with no quoting, so a `#`
 * that is preceded by whitespace (or starts the line) always begins a comment.
 * Anchoring on the preceding whitespace keeps values such as `foo#bar` intact.
 *
 * @param {string} rawLine
 * @returns {string} the line with any trailing comment removed
 */
export function stripComment(rawLine) {
  const m = rawLine.match(/(^|\s)#/);
  if (!m) return rawLine;
  return rawLine.slice(0, m.index + (m[1] ? m[1].length : 0));
}

/**
 * Parses the flow-map body of an inline `permissions: { a: read, b: write }`.
 *
 * @param {string} body text between the braces
 * @returns {Record<string, string>} scope → level
 */
function parseFlowMap(body) {
  /** @type {Record<string, string>} */
  const scopes = {};
  for (const entry of body.split(',')) {
    const m = entry.trim().match(/^([\w-]+)\s*:\s*([\w-]+)$/);
    if (m) scopes[m[1]] = m[2];
  }
  return scopes;
}

/**
 * Reads a `permissions:` value starting at `idx`, handling every form GitHub
 * accepts: the `read-all` / `write-all` shorthands, an empty `{}` (which grants
 * nothing), an inline flow map, and the usual nested block map.
 *
 * @param {string[]} lines all lines of the workflow file
 * @param {number} idx 0-based index of the `permissions:` line
 * @param {number} keyIndent indent of the `permissions:` key itself
 * @returns {{ spec: PermissionSpec | null, next: number }} the parsed spec (null
 *   when the value is a form this parser does not understand, e.g. a `${{ }}`
 *   expression) and the index to resume scanning from
 */
export function readPermissionsValue(lines, idx, keyIndent) {
  const declaredLine = idx + 1;
  const inline = stripComment(lines[idx])
    .trim()
    .slice('permissions:'.length)
    .trim();

  if (inline) {
    if (inline === 'read-all') {
      return {
        spec: { kind: 'all', level: 'read', line: declaredLine },
        next: idx + 1,
      };
    }
    if (inline === 'write-all') {
      return {
        spec: { kind: 'all', level: 'write', line: declaredLine },
        next: idx + 1,
      };
    }
    const flow = inline.match(/^\{(.*)\}$/s);
    if (flow) {
      // `permissions: {}` is a real and meaningful form: it grants nothing.
      const scopes = parseFlowMap(flow[1]);
      return {
        spec: { kind: 'map', scopes, scopeLines: {}, line: declaredLine },
        next: idx + 1,
      };
    }
    // Anything else (most likely a `${{ }}` expression) is not statically
    // resolvable. Return null so the caller records it as unparseable rather
    // than silently treating it as "grants nothing".
    return { spec: null, next: idx + 1 };
  }

  /** @type {Record<string, string>} */
  const scopes = {};
  /** @type {Record<string, number>} */
  const scopeLines = {};
  let j = idx + 1;
  for (; j < lines.length; j++) {
    const raw = lines[j];
    const stripped = stripComment(raw).trim();
    // Blank and comment-only lines do not terminate the block — a comment is
    // routinely indented to column 0 relative to nothing in particular, and
    // treating it as a dedent would truncate the permission list.
    if (!stripped) continue;
    if (indentOf(raw) <= keyIndent) break;
    const m = stripped.match(/^([\w-]+)\s*:\s*([\w-]+)\s*$/);
    if (m) {
      scopes[m[1]] = m[2];
      scopeLines[m[1]] = j + 1;
    }
  }
  return {
    spec: { kind: 'map', scopes, scopeLines, line: declaredLine },
    next: j,
  };
}

/**
 * @typedef {{ kind: 'all', level: 'read'|'write', line: number }
 *   | { kind: 'map', scopes: Record<string,string>, scopeLines: Record<string,number>, line: number }} PermissionSpec
 */

/**
 * @typedef {{
 *   id: string,
 *   line: number,
 *   uses: string | null,
 *   usesLine: number | null,
 *   permissions: PermissionSpec | null,
 *   permissionsDeclared: boolean,
 * }} ParsedJob
 */

/**
 * Parses a workflow file into the subset this check needs: the top-level
 * `permissions:` block and, per job, its `uses:` target and own `permissions:`.
 *
 * Deliberately a line-based parser rather than a YAML load: it needs 1-based
 * line numbers for every reported location, and it matches the existing
 * .github/scripts parsing style (see required-checks-lint.mjs). Only standard
 * 2-space-indented GitHub Actions YAML is supported, which is what this repo
 * writes.
 *
 * @param {string} text raw file contents
 * @returns {{ permissions: PermissionSpec | null, permissionsDeclared: boolean, jobs: ParsedJob[] }}
 */
export function parseWorkflow(text) {
  const lines = text.split('\n');
  /** @type {PermissionSpec | null} */
  let permissions = null;
  let permissionsDeclared = false;
  /** @type {ParsedJob[]} */
  const jobs = [];

  let inJobs = false;
  /** @type {ParsedJob | null} */
  let currentJob = null;

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const stripped = stripComment(raw).trim();
    if (!stripped) {
      i++;
      continue;
    }
    const indent = indentOf(raw);

    if (indent === 0) {
      inJobs = /^jobs:\s*$/.test(stripped);
      currentJob = null;
      if (/^permissions:/.test(stripped)) {
        permissionsDeclared = true;
        const { spec, next } = readPermissionsValue(lines, i, 0);
        permissions = spec;
        i = next;
        continue;
      }
      i++;
      continue;
    }

    if (indent === 2 && inJobs) {
      const m = stripped.match(/^([\w-]+):\s*$/);
      if (m) {
        currentJob = {
          id: m[1],
          line: i + 1,
          uses: null,
          usesLine: null,
          permissions: null,
          permissionsDeclared: false,
        };
        jobs.push(currentJob);
      }
      i++;
      continue;
    }

    // Job-level keys only. Step-level `uses:` sits at indent >= 6 and is
    // correctly ignored — steps have no workflow_call boundary.
    if (indent === 4 && inJobs && currentJob) {
      const usesM = stripped.match(/^uses:\s*(.+)$/);
      if (usesM) {
        currentJob.uses = usesM[1].trim().replace(/^['"](.*)['"]$/, '$1');
        currentJob.usesLine = i + 1;
      }
      if (/^permissions:/.test(stripped)) {
        currentJob.permissionsDeclared = true;
        const { spec, next } = readPermissionsValue(lines, i, 4);
        currentJob.permissions = spec;
        i = next;
        continue;
      }
    }

    i++;
  }

  return { permissions, permissionsDeclared, jobs };
}

/**
 * Resolves the level a spec grants for a single scope.
 *
 * `read-all` / `write-all` grant that level for every scope. A block map grants
 * only what it lists; an unlisted scope under an explicit block is `none`,
 * which is precisely the LS-9380 failure (deploy.yml listed four scopes and
 * omitted `statuses`).
 *
 * @param {PermissionSpec} spec
 * @param {string} scope
 * @returns {string} one of none/read/write (or a verbatim unknown level)
 */
export function grantedLevel(spec, scope) {
  if (spec.kind === 'all') return spec.level;
  return spec.scopes[scope] ?? 'none';
}

/**
 * True when `granted` is at least as privileged as `required`.
 *
 * Unknown level strings (a typo, or a scope level GitHub adds later) are
 * treated conservatively: they satisfy a requirement only when identical, so a
 * typo surfaces as a reported gap rather than being silently waved through.
 *
 * @param {string} granted
 * @param {string} required
 * @returns {boolean}
 */
export function satisfies(granted, required) {
  if (granted === required) return true;
  const g = LEVEL_RANK[granted];
  const r = LEVEL_RANK[required];
  if (g === undefined || r === undefined) return false;
  return g >= r;
}

/**
 * Compares one caller grant against one callee requirement.
 *
 * @param {PermissionSpec} granted effective caller permissions
 * @param {PermissionSpec} required callee's declared top-level permissions
 * @returns {{ scope: string, required: string, granted: string }[]} one entry
 *   per scope the caller fails to grant, in declaration order
 */
export function missingScopes(granted, required) {
  // A callee declaring read-all/write-all needs that level on every scope, but
  // the finite set of scopes GitHub defines is not enumerated here. Requiring
  // the caller to be at least as permissive in kind is both sufficient and
  // free of false positives: read-all covers a read-all requirement, write-all
  // covers either.
  if (required.kind === 'all') {
    if (granted.kind === 'all' && satisfies(granted.level, required.level))
      return [];
    return [
      {
        scope: `${required.level}-all`,
        required: required.level,
        granted: granted.kind === 'all' ? granted.level : 'partial',
      },
    ];
  }

  const gaps = [];
  for (const [scope, level] of Object.entries(required.scopes)) {
    // `none` requires nothing, so it can never produce a gap.
    if (level === 'none') continue;
    const have = grantedLevel(granted, scope);
    if (!satisfies(have, level)) {
      gaps.push({ scope, required: level, granted: have });
    }
  }
  return gaps;
}

/**
 * True for `uses:` values that name a local reusable workflow.
 *
 * Composite actions (`./.github/actions/**`) and third-party actions
 * (`owner/repo@ref`) are excluded — neither crosses a workflow_call boundary.
 *
 * @param {string | null} uses
 * @returns {boolean}
 */
export function isLocalReusableWorkflow(uses) {
  if (!uses) return false;
  return /^\.\/\.github\/workflows\/[^\s@]+\.ya?ml$/.test(uses);
}

/**
 * Walks every workflow file, resolves each local reusable-workflow call site,
 * and compares effective caller permissions against callee requirements.
 *
 * @param {object} [options]
 * @param {string} [options.workflowsDir] directory of workflow files
 * @param {string} [options.root] repo root that `./`-relative `uses:` resolve against
 * @returns {{ callSites: object[], violations: object[], skipped: object[], filesScanned: number }}
 */
export function checkWorkflowCallPermissions({
  workflowsDir = WORKFLOWS_DIR,
  root = ROOT,
} = {}) {
  const files = readdirSync(workflowsDir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort();

  /** @type {Map<string, ReturnType<typeof parseWorkflow>>} */
  const parsed = new Map();
  const parseFile = (absPath) => {
    if (!parsed.has(absPath)) {
      parsed.set(absPath, parseWorkflow(readFileSync(absPath, 'utf8')));
    }
    return parsed.get(absPath);
  };

  const rel = (absPath) => path.relative(root, absPath).replace(/\\/g, '/');

  const callSites = [];
  const violations = [];
  const skipped = [];

  for (const file of files) {
    const callerAbs = path.join(workflowsDir, file);
    const caller = parseFile(callerAbs);
    const callerRel = rel(callerAbs);

    for (const job of caller.jobs) {
      if (!isLocalReusableWorkflow(job.uses)) continue;

      const calleeAbs = path.resolve(root, job.uses.replace(/^\.\//, ''));
      const calleeRel = rel(calleeAbs);
      const site = {
        callerFile: callerRel,
        callerJob: job.id,
        callerLine: job.usesLine,
        calleeFile: calleeRel,
      };

      if (!existsSync(calleeAbs)) {
        // A dangling `uses:` is its own (fatal at run start) bug, but it is
        // validate-workflows' territory — record it and move on rather than
        // crashing this check.
        skipped.push({
          ...site,
          reason: `callee file not found: ${calleeRel}`,
        });
        continue;
      }

      const callee = parseFile(calleeAbs);
      if (!callee.permissionsDeclared || !callee.permissions) {
        skipped.push({
          ...site,
          reason: callee.permissionsDeclared
            ? 'callee declares permissions in a form this check cannot resolve statically'
            : 'callee declares no top-level permissions — nothing to satisfy',
        });
        continue;
      }

      if (job.permissionsDeclared && job.permissions === null) {
        // The job HAS a block, but in a form that cannot be resolved statically
        // (e.g. a `${{ }}` expression). Falling back to the workflow-level block
        // would compare against permissions this job does not actually use, so
        // skip instead — a job block supersedes the workflow-level one, and
        // guessing at its contents can only manufacture false positives.
        skipped.push({
          ...site,
          reason:
            'the calling job declares permissions in a form this check cannot ' +
            'resolve statically (e.g. an expression)',
        });
        continue;
      }

      // Inheritance: the job's own block wins; otherwise the workflow-level
      // block applies. Getting this backwards (or forgetting the fallback) is
      // the main false-positive risk for this check — ci-orchestrator.yml calls
      // both of its children from jobs with no job-level block.
      const usedJobLevel = job.permissionsDeclared;
      const granted = usedJobLevel ? job.permissions : caller.permissions;
      const grantSource = usedJobLevel
        ? { scope: 'job', line: job.permissions.line }
        : { scope: 'workflow', line: caller.permissions?.line ?? null };

      if (!granted) {
        // Neither the job nor the workflow declares resolvable permissions, so
        // the repo/org default GITHUB_TOKEN permissions apply. Those are not
        // knowable from the workflow files; reporting a gap here would be a
        // guess, and a wrong guess blocks every PR in the repo.
        skipped.push({
          ...site,
          reason:
            'neither the calling job nor the calling workflow declares permissions — ' +
            'default GITHUB_TOKEN permissions apply and cannot be resolved statically',
        });
        continue;
      }

      const gaps = missingScopes(granted, callee.permissions);
      const entry = {
        ...site,
        grantSource,
        calleePermissionsLine: callee.permissions.line,
        gaps,
      };
      callSites.push(entry);
      if (gaps.length > 0) violations.push(entry);
    }
  }

  return { callSites, violations, skipped, filesScanned: files.length };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * Renders the human-readable report for a result.
 *
 * @param {ReturnType<typeof checkWorkflowCallPermissions>} result
 * @param {boolean} advisory
 * @returns {string[]} lines to print
 */
export function formatReport(result, advisory) {
  const out = [];
  const { callSites, violations, skipped, filesScanned } = result;

  out.push(
    `Scanned ${filesScanned} workflow file(s); ${callSites.length} local reusable-workflow call site(s) verified.`,
  );

  for (const site of callSites) {
    if (site.gaps.length > 0) continue;
    out.push(
      `  ✓ ${site.callerFile}:${site.callerLine} (job "${site.callerJob}", ` +
        `${site.grantSource.scope}-level permissions) → ${site.calleeFile}`,
    );
  }

  for (const site of skipped) {
    out.push(
      `  – ${site.callerFile}:${site.callerLine} → ${site.calleeFile}: ${site.reason}`,
    );
  }

  for (const site of violations) {
    const label = advisory ? '::warning::' : '';
    out.push('');
    out.push(
      `${label}${site.callerFile}:${site.callerLine} — job "${site.callerJob}" calls ` +
        `${site.calleeFile} but does not grant every permission the callee declares.`,
    );
    for (const gap of site.gaps) {
      out.push(
        `    missing scope "${gap.scope}": callee requires ${gap.required}, ` +
          `caller grants ${gap.granted}`,
      );
    }
    out.push(
      `    caller ${site.grantSource.scope}-level permissions: ` +
        `${site.callerFile}:${site.grantSource.line}`,
    );
    out.push(
      `    callee permissions: ${site.calleeFile}:${site.calleePermissionsLine}`,
    );
    out.push(
      `    Fix: add the scope(s) above to the caller's permissions block. A called ` +
        `workflow cannot request a scope its caller withholds — GitHub fails the ` +
        `WHOLE run at startup with zero jobs (LS-9380).`,
    );
  }

  return out;
}

function main(argv) {
  const advisory = argv.includes('--advisory');
  const asJson = argv.includes('--json');
  const result = checkWorkflowCallPermissions();

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const line of formatReport(result, advisory)) console.log(line);
    console.log('');
    if (result.violations.length === 0) {
      console.log(
        `✅ All ${result.callSites.length} reusable-workflow call site(s) grant a superset of their callee's permissions`,
      );
    } else if (advisory) {
      console.log(
        `::warning::⚠️  ${result.violations.length} reusable-workflow call site(s) are missing permission scopes ` +
          `(ADVISORY — not failing the build; see LS-9381 for promotion to blocking)`,
      );
    } else {
      console.error(
        `❌ ${result.violations.length} reusable-workflow call site(s) are missing permission scopes`,
      );
    }
  }

  if (advisory) return 0;
  return result.violations.length > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)));
}
