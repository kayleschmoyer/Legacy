#!/usr/bin/env node
/**
 * PreToolUse hook: risk guard for destructive / irreversible / policy-violating
 * tool calls. Complements the existing narrow guards (guard-main-repo,
 * guard-make-pc, enforce-background) with a general safety net.
 *
 * Matched tools (see .claude/settings.json matcher):
 *   Bash, Edit, Write, NotebookEdit, the db_query MCP tools, and
 *   mcp__github__actions_list / actions_run_trigger / actions_get / get_job_logs.
 *
 * Four severity tiers:
 *   CATASTROPHIC — blocked, no bypass (exit 2). rm -rf on root/home/.git,
 *     force pushes, any push to main, secret material embedded in tool args.
 *   CORRECTABLE — blocked, no bypass (exit 2), but the remedy is rewriting the
 *     call rather than abandoning it. Reserved for arguments that are accepted
 *     by a tool's schema yet do not mean what they appear to mean, so the call
 *     "succeeds" with silently wrong scope. A bypass marker would be actively
 *     harmful here: there is no state of the world in which the mis-shaped call
 *     is the one the caller wanted. See `actionsListFindings`.
 *   GUARDED — blocked (exit 2) but bypassable with a `# risk-ok: <reason>`
 *     marker (SQL: `-- risk-ok`) once the agent has verified the action is
 *     intentional. Covers repo Tier-1/2 rules: manual worktree removal,
 *     nx reset, npm/yarn usage, pnpm install through worktree symlinks,
 *     git clean -dx, git reset --hard, git checkout/restore whole-tree
 *     overwrites (`git checkout <ref> -- .`, `git restore --source=<ref> .`),
 *     DROP/TRUNCATE.
 *   WARN — allowed (exit 0) with an in-context caution. Recursive rm on other
 *     paths, DELETE without WHERE, chmod -R 777.
 *
 * False-positive hygiene: command-pattern rules are evaluated on a copy of the
 * command with heredoc bodies and quoted strings stripped, so a commit message
 * like `git commit -m "remove rm -rf usage"` never trips the guard. The secret
 * scan intentionally runs on the RAW text (secrets live inside quotes).
 * A GUARDED rule may also carry a `gate` — a predicate checking real filesystem
 * state — so it only fires where its rationale actually holds (see
 * `pnpmInstallGate`).
 *
 * Audit trail: every hit (including bypassed ones) is appended to
 * .claude/audit/risk-guard.jsonl (gitignored).
 */

import { lstatSync, statSync } from 'fs';
import { isAbsolute, join } from 'path';
import {
  readHookInput,
  appendJsonl,
  auditDir,
  projectDir,
  truncate,
} from './lib/hook-utils.mjs';

const input = readHookInput();
if (!input?.tool_name) process.exit(0);

const tool = input.tool_name;
const ti = input.tool_input ?? {};

// ---------------------------------------------------------------------------
// Gather scannable text per tool
// ---------------------------------------------------------------------------
let command = ''; // shell command (Bash)
let sql = ''; // SQL text (db_query)
let content = ''; // file content being written (Edit/Write/NotebookEdit)
let callArgs = ''; // serialised MCP arguments (structured-input tools)

// Structured-input MCP tools carry no free text to pattern-match. They are
// judged on their argument SHAPE instead (see `actionsListFindings` and
// `actionsRunTriggerOrGetFindings`), so the serialised arguments stand in as
// `raw` purely for the audit log and the block message.
const isActionsList = tool === 'mcp__github__actions_list';
const isActionsRunTrigger = tool === 'mcp__github__actions_run_trigger';
const isActionsGet = tool === 'mcp__github__actions_get';
const isGetJobLogs = tool === 'mcp__github__get_job_logs';

if (tool === 'Bash') command = String(ti.command ?? '');
else if (tool === 'Edit') content = String(ti.new_string ?? '');
else if (tool === 'Write') content = String(ti.content ?? '');
else if (tool === 'NotebookEdit') content = String(ti.new_source ?? '');
else if (/__db_query$/.test(tool)) sql = String(ti.sql ?? ti.query ?? '');
else if (isActionsList || isActionsRunTrigger || isActionsGet || isGetJobLogs) {
  try {
    callArgs = JSON.stringify(ti);
  } catch {
    callArgs = '[unserialisable arguments]';
  }
}

const raw = command || sql || content || callArgs;
if (!raw) process.exit(0);

// ---------------------------------------------------------------------------
// Sanitised view for command-pattern rules: drop heredoc bodies and the
// contents of quoted strings so prose never matches destructive patterns.
// ---------------------------------------------------------------------------
function stripHeredocs(text) {
  const lines = text.split('\n');
  const out = [];
  let delim = null;
  for (const line of lines) {
    if (delim) {
      if (line.trim() === delim) delim = null;
      continue;
    }
    const m = line.match(/<<-?\s*["']?(\w+)["']?/);
    out.push(line);
    if (m) delim = m[1];
  }
  return out.join('\n');
}

function stripQuoted(text) {
  return text.replace(/'[^']*'/g, "''").replace(/"(?:\\.|[^"\\])*"/g, '""');
}

const scannable = command ? stripQuoted(stripHeredocs(command)) : sql;

// ---------------------------------------------------------------------------
// Bypass marker (never honoured for CATASTROPHIC)
// ---------------------------------------------------------------------------
const bypassed = /(^|[\s])(#|--)\s*risk-ok/.test(raw);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
const SECRET_PATTERNS = [
  [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
  [/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/, 'GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{22,}/, 'GitHub fine-grained PAT'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key material'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic API key'],
  [/\b[sr]k_live_[A-Za-z0-9]{20,}/, 'Stripe live key'],
];

// ---------------------------------------------------------------------------
// Rule gates — extra conditions a GUARDED rule must satisfy before it fires.
// A gate returns { fire, message? }; the message overrides the rule's default.
// ---------------------------------------------------------------------------

/** True when this checkout is a linked worktree (`.git` is a file, not a dir). */
function isLinkedWorktree(root) {
  try {
    return statSync(join(root, '.git')).isFile();
  } catch {
    return false;
  }
}

/**
 * Best-effort resolution of the cwd a shell command actually runs in, by
 * replaying any `cd <path>` segments that precede it left to right. Handles
 * the common chaining forms (`&&`, `;`, `|`, `then`/`do`) and quoted paths.
 * Falls back to `root` when the command never `cd`s anywhere — which is the
 * overwhelmingly common case and exactly what preserves prior behaviour.
 *
 * This is what lets `make lockfile`'s isolated-temp-dir procedure — which
 * `cd`s into a scratch copy of just the manifest files before running
 * `pnpm install --lockfile-only` there — read as running against that temp
 * dir's (non-existent, non-symlinked) node_modules rather than the
 * worktree's shared pool symlink two directories up.
 */
function commandCwd(root, cmd) {
  let cwd = root;
  const cdRe =
    /(^|[;&|]|\bthen\b|\bdo\b)\s*cd\s+(?:--\s+)?("[^"]*"|'[^']*'|\S+)/g;
  let m;
  while ((m = cdRe.exec(cmd))) {
    let path = m[2];
    if (
      (path.startsWith('"') && path.endsWith('"')) ||
      (path.startsWith("'") && path.endsWith("'"))
    ) {
      path = path.slice(1, -1);
    }
    cwd = isAbsolute(path) ? path : join(cwd, path);
  }
  return cwd;
}

/**
 * pnpm subcommands that rewrite `package.json` + `pnpm-lock.yaml`. Because the
 * pool slot hash is sha256(pnpm-lock.yaml) (+ the pinned `packageManager`),
 * these are exactly the commands that mint a NEW slot rather than mutating the
 * current one — which is why they are the sanctioned way to change a
 * worktree's dependency set once it has detached from the pool.
 */
const PNPM_MANIFEST_WRITE = /(^|[;&|\s])pnpm\s+(add|remove|update)\b/;

/**
 * `pnpm install --lockfile-only` resolves and rewrites `pnpm-lock.yaml` without
 * materialising a `node_modules` tree at all. Same slot-minting effect as the
 * verbs above, so it belongs on the same side of the gate — it is how you
 * refresh a `pnpmfileChecksum` after editing `.pnpmfile.cjs`.
 */
const PNPM_LOCKFILE_ONLY =
  /(^|[;&|\s])pnpm\s+(install|i)\b[^\n]*\s--lockfile-only\b/;

/**
 * `pnpm-install-symlink` only applies where its rationale does: pnpm writing
 * through a worktree symlink rewrites the shared pool slot every other worktree
 * on the machine is linked to. In a main-repo or Claude Code Remote
 * direct-branch checkout node_modules is a real directory, so installing there
 * is exactly the right move — blocking it was a false positive (LS-8731).
 *
 * The mirror-image false positive is the DETACHED state (LS-9828): step 1 of
 * install-packages.md removes the symlink precisely so pnpm can write a private
 * tree, and step 2 is `pnpm add -w <pkg>`. Firing there blocked our own
 * documented procedure at the step that makes it work.
 *
 * Scoped to the command's actual cwd (LS-9837), not the worktree root: a
 * `cd <tmpdir> && pnpm install --lockfile-only` never touches the symlinked
 * pool at the worktree root, so it should be judged against the tmpdir it
 * really runs in — see `commandCwd`.
 */
function pnpmInstallGate() {
  const root = projectDir(input);
  const cwd = commandCwd(root, scannable);
  try {
    // lstat, not stat: Windows junctions (what modules-pool/link.mjs creates)
    // also report as symbolic links here, but resolve away under stat.
    return lstatSync(join(cwd, 'node_modules')).isSymbolicLink()
      ? { fire: true }
      : { fire: false };
  } catch (err) {
    if (err?.code !== 'ENOENT') return { fire: false }; // fail open
    // No node_modules at the resolved cwd. In the main repo (or any plain
    // directory that isn't a linked worktree — e.g. the isolated tmpdir) a
    // real install/lockfile-only run is the legitimate one.
    if (!isLinkedWorktree(cwd)) return { fire: false };
    // A linked worktree with no node_modules is the detached state. Nothing
    // here can reach the shared slot — the symlink is already gone — and a
    // lockfile-rewriting command is the documented next step, so let it run.
    if (
      PNPM_MANIFEST_WRITE.test(scannable) ||
      PNPM_LOCKFILE_ONLY.test(scannable)
    ) {
      return { fire: false };
    }
    // Bare `pnpm install` is different: the dependency set is not changing, so
    // there is a slot for this lockfile already and linking beats reinstalling.
    return {
      fire: true,
      message:
        'This worktree has no node_modules yet — `pnpm install` would build it a private tree ' +
        'instead of linking the shared pool. Run `node scripts/modules-pool/link.mjs` first. ' +
        '(Adding a package is different: `pnpm add -w <pkg>` here is the sanctioned step 2 of ' +
        '.agents/skills/repo-tooling/references/install-packages.md and is allowed.)',
    };
  }
}

/**
 * `git worktree remove` only destroys a node_modules pool symlink when the
 * worktree being removed actually has one. The pool itself is Windows-only
 * (scripts/modules-pool/link.mjs junctions node_modules, gated on
 * `process.platform === 'win32'`) and cloud/CCR sessions have no twig or
 * worktree pooling at all (AGENTS.md: "Cloud agent: Ubuntu Linux — no
 * worktrees/twig"). So a plain `git worktree add` scratch checkout — e.g. a
 * throwaway `/tmp` clone of origin/main used to isolation-test a failing
 * test (LS-9606) — has nothing for this rule to protect, and the `twig
 * worktree clean` fix in the block message is unusable in exactly the
 * environment where that scratch pattern is most common. Fire only when the
 * target actually has a symlinked node_modules; fail open (allow) whenever
 * the target can't be determined or has no pooled node_modules to lose.
 */
function worktreeRemoveGate() {
  const m = scannable.match(
    /git\s+(?:-C\s+\S+\s+)*worktree\s+remove\s+(?:--force\s+|-f\s+)*(\S+)/,
  );
  const target = m?.[1];
  if (!target || target.startsWith('-')) return { fire: false };
  const root = projectDir(input);
  const resolved = isAbsolute(target) ? target : join(root, target);
  try {
    return lstatSync(join(resolved, 'node_modules')).isSymbolicLink()
      ? { fire: true }
      : { fire: false };
  } catch {
    return { fire: false };
  }
}

// ---------------------------------------------------------------------------
// mcp__github__actions_list — argument-shape rules (LS-10156, LS-9987)
//
// This tool belongs to the officially-hosted GitHub MCP server; it is not
// vendored under tools/mcp/, so neither its lenient schema nor its silent
// fallback can be patched from this repo. A PreToolUse guard is the only layer
// we control, and it is the layer the two prior doc-only fixes lacked.
//
// The hazard is specific and verified against the live schema (2026-09-13):
// the real input schema has NO top-level `workflow_id` or `branch` param and
// NO `additionalProperties: false`, so the plausible-but-wrong
// `{ workflow_id, branch }` shape is accepted with zero validation error and
// silently no-ops — `resource_id` stays unset (the unscoped repo-wide
// /actions/runs list is used) and no filter narrows the branch. Repro on this
// repo, side by side:
//
//   wrong:   { workflow_id: "check-migrations-applied.yml", branch: "X" }
//              -> total_count 40000, unrelated workflows, head_branch "main"
//   correct: { resource_id: "check-migrations-applied.yml",
//              workflow_runs_filter: { branch: "main" } }
//              -> total_count 28, only that workflow, only that branch
//
// LS-10055 root-caused this and landed guidance in
// .agents/skills/mcp-first/references/service-operations.md. The guidance was
// correct and still did not hold: LS-10156 is the same wrong-shaped call made
// again by a session that had not read that reference. Prose cannot reach a
// call the agent is about to make; this hook can.
// ---------------------------------------------------------------------------

/** Every top-level key the live schema actually accepts. */
const ACTIONS_LIST_KEYS = new Set([
  'method',
  'owner',
  'repo',
  'page',
  'perPage',
  'resource_id',
  'workflow_jobs_filter',
  'workflow_runs_filter',
]);

/**
 * Where each commonly-invented key really belongs. Every entry here has been
 * observed in a real session (LS-9632, LS-8738, LS-10055, LS-10156) — these
 * are not hypothetical typos. `null` marks a filter the tool cannot express at
 * all, where the only correct answer is a different tool.
 */
const ACTIONS_LIST_PHANTOM_KEYS = {
  workflow_id: 'resource_id',
  workflow: 'resource_id',
  workflow_ref: 'resource_id',
  workflow_file: 'resource_id',
  workflow_name: 'resource_id',
  run_id: 'resource_id',
  job_id: 'resource_id',
  branch: 'workflow_runs_filter.branch',
  event: 'workflow_runs_filter.event',
  status: 'workflow_runs_filter.status',
  actor: 'workflow_runs_filter.actor',
  filter: 'workflow_jobs_filter.filter',
  per_page: 'perPage',
  page_size: 'perPage',
  head_sha: null,
  sha: null,
  commit: null,
};

/**
 * Runs are the verbose method: each run object embeds `head_commit.message`
 * verbatim, and this repo's squash-merge convention puts an entire PR
 * description (routinely 1-3 KB of markdown, measured up to 4.5 KB) in every
 * one. There is no param to omit or truncate that field, so response size is
 * governed entirely by `perPage` — whose default of 30 is itself the bad
 * default LS-9987 reports (30 runs measured at 132,491 chars, over the
 * tool-result cap). Five is the largest page observed to come back under the
 * cap on this repo.
 */
// LS-10188 re-measured this on `run-playwright-tests.yml`: a correctly
// scoped-and-filtered call (resource_id + workflow_runs_filter both set, so
// neither the phantom-param nor the unscoped-runs rule above fires) still
// overflowed at perPage: 15 — 81,763 characters, at ~5.4 KB/run, higher than
// the ~4.4 KB/run LS-9987 measured on ci-orchestrator.yml. Confirmed this is
// not a regression of that fix: this rule already blocks perPage: 15 (> 5)
// regardless of scope, since a workflow/branch filter narrows which runs come
// back, not how much each one weighs. The 5-run ceiling holds a comfortable
// margin even at the higher observed rate (5 * 5.4 KB ≈ 27 KB, well under the
// cap that 81,763 chars at 15 runs exceeded).
const ACTIONS_LIST_RUNS_PAGE_MAX = 5;
const ACTIONS_LIST_RUNS_PAGE_DEFAULT = 30;

const CI_LIST_RUNS_HINT =
  'Prefer `ci_list_runs({ branch, workflow, commit, limit })` (legacy-sports-ci): it builds the ' +
  'scoped /actions/workflows/{id}/runs path itself, resolves a display name/filename/numeric ID up ' +
  'front and throws on an unresolvable one instead of silently falling back, and maps each run to a ' +
  'small flat object rather than the full GitHub run payload. For one commit or PR, ' +
  '`github_get_check_runs({ sha })` / `({ prNumber })` (legacy-sports-github) is smaller still. Both ' +
  'servers are known to attach late in CCR sessions (LS-9576/LS-9370) — re-run ToolSearch for them ' +
  'before concluding actions_list is the only path.';

function actionsListFindings(args) {
  const out = [];
  const method = typeof args.method === 'string' ? args.method : '';
  const isRuns = method === 'list_workflow_runs';

  // --- Rule 1: params the schema silently swallows ---
  const phantoms = Object.keys(args).filter((k) => !ACTIONS_LIST_KEYS.has(k));
  if (phantoms.length > 0) {
    const lines = phantoms.map((k) => {
      // Object.hasOwn, not `in`: `in` walks the prototype chain, so a phantom
      // key called `toString` or `constructor` would read as "known" and
      // render a function where the parameter name belongs.
      if (!Object.hasOwn(ACTIONS_LIST_PHANTOM_KEYS, k)) {
        return `  - \`${k}\` — not a parameter of this tool; it will be dropped.`;
      }
      const real = ACTIONS_LIST_PHANTOM_KEYS[k];
      return real === null
        ? `  - \`${k}\` — this tool cannot filter by commit at all. Use \`ci_list_runs({ commit })\` instead.`
        : `  - \`${k}\` — the real parameter is \`${real}\`.`;
    });
    out.push({
      severity: 'CORRECTABLE',
      rule: 'actions-list-phantom-params',
      message:
        `${phantoms.length === 1 ? 'This parameter is' : 'These parameters are'} not in ` +
        `mcp__github__actions_list's schema, and the schema has no \`additionalProperties: false\` — ` +
        `so the call would be ACCEPTED and the ${phantoms.length === 1 ? 'value' : 'values'} ` +
        `silently dropped (LS-10156):\n${lines.join('\n')}\n\n` +
        (isRuns
          ? 'With the workflow/branch scope dropped, `list_workflow_runs` falls back to the unscoped ' +
            'repo-wide run list and returns it as though it were filtered. Nothing in the response ' +
            'marks it as unfiltered except an implausibly large `total_count`, so this fails silently ' +
            'rather than loudly.'
          : 'The call runs against whatever scope the remaining parameters imply, which is not the ' +
            'one these parameters were meant to express.'),
    });
  }

  // --- Rule 2: an unscoped run listing is the repo-wide firehose ---
  // Present-but-empty is the same as absent to the API: `resource_id: ""`
  // builds no workflow path segment and `workflow_runs_filter: {}` contributes
  // no query params, so neither narrows anything. Checking only for
  // `undefined` would let both through as if they were real scope.
  const hasWorkflowScope =
    typeof args.resource_id === 'string'
      ? args.resource_id.trim() !== ''
      : typeof args.resource_id === 'number';
  const filter = args.workflow_runs_filter;
  const hasFilterScope =
    typeof filter === 'object' &&
    filter !== null &&
    Object.values(filter).some(
      (v) => v !== undefined && v !== null && String(v).trim() !== '',
    );

  if (isRuns && !hasWorkflowScope && !hasFilterScope) {
    out.push({
      severity: 'CORRECTABLE',
      rule: 'actions-list-unscoped-runs',
      message:
        'This `list_workflow_runs` call has neither `resource_id` nor `workflow_runs_filter`, so it ' +
        'lists EVERY workflow run in the repository (~40,000 here) newest-first — runs from unrelated ' +
        'workflows, branches and PRs, which read as a plausible answer to whatever you were actually ' +
        'asking. Scope it with `resource_id: "<workflow-file>.yml"` and/or ' +
        '`workflow_runs_filter: { branch, event, status, actor }`.',
    });
  }

  // --- Rule 3: page size, against a response with no way to omit the bulk ---
  if (isRuns) {
    const explicit = args.perPage;
    const requested =
      typeof explicit === 'number' ? explicit : ACTIONS_LIST_RUNS_PAGE_DEFAULT;
    if (requested > ACTIONS_LIST_RUNS_PAGE_MAX) {
      out.push({
        severity: 'CORRECTABLE',
        rule: 'actions-list-verbose-runs',
        message:
          (explicit === undefined
            ? `\`perPage\` is unset, so this call uses the tool's default of ${ACTIONS_LIST_RUNS_PAGE_DEFAULT}. `
            : `\`perPage: ${explicit}\` exceeds the ${ACTIONS_LIST_RUNS_PAGE_MAX}-run ceiling this repo can return under the tool-result cap. `) +
          'Every run embeds `head_commit.message` verbatim, and this repo squash-merges entire PR ' +
          'descriptions into commit messages (1-3 KB each, measured up to 4.5 KB). There is no param ' +
          'to omit or truncate that field, so page size is the only control there is: 30 runs measured ' +
          '132,491 characters, over the cap (LS-9987). An overflowed result costs the tokens and ' +
          'returns nothing usable.\n\n' +
          `Pass \`perPage: ${ACTIONS_LIST_RUNS_PAGE_MAX}\` or fewer and page with \`page\` if you need more.`,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// mcp__github__actions_run_trigger / mcp__github__actions_get (LS-10090)
//
// Same "not our tool" constraint as actions_list above — both belong to the
// officially-hosted GitHub MCP server, not tools/mcp/, so neither the method
// enum's silent fallthrough nor the run_id/resource_id naming split can be
// fixed at the schema level from this repo. Two independently-observed
// failure modes, both reproduced dispatching a real workflow_dispatch run
// (LS-10033 verification):
//
//   1. actions_run_trigger's `method` is a real JSON-Schema enum
//      (run_workflow / rerun_workflow_run / rerun_failed_jobs /
//      cancel_workflow_run / delete_workflow_run_logs), but an invalid value
//      is not rejected against that enum before the handler's own
//      parameter-presence checks run. Passing `method: "workflow_dispatch"`
//      (GitHub's own REST API event name, and the natural guess) reaches the
//      run_workflow-adjacent presence check and fails with
//      "missing required parameter: run_id" — actively misleading, since
//      run_workflow's real required params are workflow_id/ref, not run_id
//      at all.
//   2. actions_run_trigger identifies a run via `run_id`; the sibling
//      actions_get tool uses `resource_id` for the identical concept. Each
//      tool accepts extra unrecognized keys silently (no
//      `additionalProperties: false`), so passing the other tool's name is
//      accepted and then fails on a "missing required parameter" for the
//      name it actually wanted — same trial-and-error shape as the
//      actions_list phantom-key hazard above, just on a single field.
// ---------------------------------------------------------------------------

const ACTIONS_RUN_TRIGGER_METHODS = [
  'run_workflow',
  'rerun_workflow_run',
  'rerun_failed_jobs',
  'cancel_workflow_run',
  'delete_workflow_run_logs',
];

const ACTIONS_GET_METHODS = [
  'get_workflow',
  'get_workflow_run',
  'get_workflow_job',
  'download_workflow_run_artifact',
  'get_workflow_run_usage',
  'get_workflow_run_logs_url',
];

function actionsRunTriggerFindings(args) {
  const out = [];
  const method = typeof args.method === 'string' ? args.method : '';

  if (method && !ACTIONS_RUN_TRIGGER_METHODS.includes(method)) {
    const guessHint =
      method === 'workflow_dispatch'
        ? ' "workflow_dispatch" is the GitHub REST API\'s event name for this operation, not a method ' +
          'of this tool — the equivalent method here is `run_workflow` (required params for ' +
          'run_workflow: `workflow_id`, `ref` — not `run_id`).'
        : '';
    out.push({
      severity: 'CORRECTABLE',
      rule: 'actions-run-trigger-invalid-method',
      message:
        `mcp__github__actions_run_trigger's \`method\` is "${method}", which is not a valid value ` +
        `and would otherwise fall through to a misleading "missing required parameter" error instead ` +
        `of a clear invalid-method one (LS-10090).${guessHint} Valid \`method\` values: ` +
        `${ACTIONS_RUN_TRIGGER_METHODS.join(', ')}.`,
    });
  }

  if ('resource_id' in args) {
    out.push({
      severity: 'CORRECTABLE',
      rule: 'actions-run-trigger-wrong-id-param',
      message:
        'mcp__github__actions_run_trigger identifies a workflow run via `run_id` — `resource_id` is ' +
        "the sibling tool mcp__github__actions_get's param name for the same concept (LS-10090). " +
        'Rename this argument to `run_id`.',
    });
  }

  return out;
}

function actionsGetFindings(args) {
  const out = [];
  const method = typeof args.method === 'string' ? args.method : '';

  if (method && !ACTIONS_GET_METHODS.includes(method)) {
    out.push({
      severity: 'CORRECTABLE',
      rule: 'actions-get-invalid-method',
      message:
        `mcp__github__actions_get's \`method\` is "${method}", which is not a valid value. Valid ` +
        `\`method\` values: ${ACTIONS_GET_METHODS.join(', ')}.`,
    });
  }

  if ('run_id' in args) {
    out.push({
      severity: 'CORRECTABLE',
      rule: 'actions-get-wrong-id-param',
      message:
        'mcp__github__actions_get identifies its target resource (a run, job, artifact, or workflow, ' +
        'depending on `method`) via `resource_id` — `run_id` is the sibling tool ' +
        "mcp__github__actions_run_trigger's param name for a workflow run specifically (LS-10090). " +
        'Rename this argument to `resource_id`.',
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// mcp__github__get_job_logs — unbounded return_content default (LS-9201, LS-10101)
//
// This tool belongs to the officially-hosted GitHub MCP server; it is not
// vendored under tools/mcp/, so its schema (and its bad default) cannot be
// patched from this repo — same constraint as actions_list above. A PreToolUse
// guard is the only layer we control.
//
// `return_content: true` fetches actual log text, bounded only by `tail_lines`
// (schema default 500 lines). That bound is line COUNT, not byte size, and
// this repo's CI output (pnpm/nx/Playwright) routinely emits multi-KB lines
// (ANSI escape codes, JSON blobs, stack traces) — LS-9201 measured 200K+
// characters at tail_lines values from 150 to 1500, and LS-10101 reproduced it
// at the unmodified 500-line schema default, on a SINGLE job's failure log
// (69,072 chars), forcing a save-to-file + Bash grep/python3 slice workaround.
// There is no max_chars/strip_ansi-equivalent param on this tool at all, so no
// tail_lines value is guaranteed safe — the fix is steering the call toward a
// smaller default and, better, the two alternatives that enforce a real hard
// character cap (see GET_JOB_LOGS_HINT below).
// ---------------------------------------------------------------------------

/** Largest tail_lines this repo has seen stay comfortably under the
 * tool-result cap on a scoped single-job failure log. Not a guarantee — see
 * above — just the ceiling the documented guidance already recommends. */
const GET_JOB_LOGS_SANE_TAIL_LINES = 100;

function getJobLogsFindings(args) {
  if (args.return_content !== true) return [];
  const tailLines = args.tail_lines;
  if (
    typeof tailLines === 'number' &&
    tailLines <= GET_JOB_LOGS_SANE_TAIL_LINES
  ) {
    return [];
  }
  return [
    {
      severity: 'CORRECTABLE',
      rule: 'get-job-logs-unbounded-tail',
      message:
        (tailLines === undefined
          ? "`tail_lines` is unset, so this call uses the tool's schema default of 500 lines. "
          : `\`tail_lines: ${tailLines}\` exceeds the ${GET_JOB_LOGS_SANE_TAIL_LINES}-line ceiling this repo has seen stay under the tool-result cap. `) +
        "This repo's CI output (pnpm/nx/Playwright) routinely emits multi-KB lines (ANSI escape codes, " +
        'JSON blobs, stack traces), so `tail_lines` bounds line COUNT, not byte size — LS-9201 measured ' +
        '200K+ characters at tail_lines values from 150 to 1500, and this exact 500-line default ' +
        "overflowed on a single job's failure log (69,072 chars, LS-10101). There is no max_chars-" +
        'equivalent param on this tool, so no tail_lines value is guaranteed safe.\n\n' +
        `Pass \`tail_lines: ${GET_JOB_LOGS_SANE_TAIL_LINES}\` or fewer, or prefer a tool with a real hard ` +
        'character cap (see below).',
    },
  ];
}

const GET_JOB_LOGS_HINT =
  'Prefer `ci_get_logs({ runId or jobId, ... })` (legacy-sports-ci) — it enforces `maxChars`/' +
  '`truncateLineLength` as hard caps regardless of line length. When only the `legacy-sports-github` ' +
  'hosted connector is available, its own `get_job_logs({ job_id, max_chars, tail_lines, ' +
  'truncate_line_length, error_summary, grep_pattern })` supports the same character-cap controls this ' +
  'built-in lacks. Both servers are known to attach late in CCR sessions (LS-9576/LS-9370) — re-run ' +
  'ToolSearch for them before concluding this built-in is the only path.';

const findings = [];

if (isActionsList) findings.push(...actionsListFindings(ti));
if (isActionsRunTrigger) findings.push(...actionsRunTriggerFindings(ti));
if (isActionsGet) findings.push(...actionsGetFindings(ti));
if (isGetJobLogs) findings.push(...getJobLogsFindings(ti));

// --- Secret scan (raw text, all tools) ---
for (const [re, label] of SECRET_PATTERNS) {
  if (re.test(raw)) {
    findings.push({
      severity: 'CATASTROPHIC',
      rule: `secret:${label}`,
      message:
        `The ${tool} arguments appear to contain ${label}. Raw secret values must NEVER be ` +
        `embedded in Edit/Write/Bash tool calls — they end up in session transcripts and logs. ` +
        `Use the secrets-handling workflow instead: .agents/skills/secrets-handling/SKILL.md.`,
    });
  }
}

// --- Bash command rules ---
if (command) {
  const CATASTROPHIC = [
    [
      /(^|[;&|\s])rm\s+(-[A-Za-z]*r[A-Za-z]*f[A-Za-z]*|-[A-Za-z]*f[A-Za-z]*r[A-Za-z]*|-r\s+-f|-f\s+-r)\s+["']?(\/\*?|~\/?|\$HOME|\*|\.\.?\/?)["']?(\s|$)/,
      'rm-rf-root',
      'Recursive force-delete of root, home, cwd, or a bare wildcard is unrecoverable.',
    ],
    [
      /(^|[;&|\s])rm\s+-[A-Za-z]*r[A-Za-z]*\s+\S*\.git(\/|["']?(\s|$))/,
      'rm-dot-git',
      'Deleting a .git directory destroys repository history. If a worktree needs cleanup, use `twig worktree clean`.',
    ],
    [
      /git\s+(?:-C\s+\S+\s+)*push\b(?=[^;&|\n]*(--force(?!-with-lease)\b|\s-f\b))/,
      'force-push',
      'Bare force pushes can destroy remote history. Use --force-with-lease on a feature branch if a rewrite is genuinely required — and never on main.',
    ],
    [
      /git\s+(?:-C\s+\S+\s+)*push\b[^\n]*\s(origin|upstream)\s+(\S+:)?(main|master)(?![\w\-/])/,
      'push-to-main',
      'Pushing directly to main is forbidden (AGENTS.md Tier 1). All changes land through a PR from a feature branch.',
    ],
  ];

  const GUARDED = [
    [
      /git\s+worktree\s+remove\b/,
      'worktree-remove',
      'Never manually remove worktrees — it destroys node_modules pool symlinks. Use `twig worktree clean` instead (AGENTS.md Tier 2).',
      worktreeRemoveGate,
    ],
    [
      /(pnpm\s+exec\s+nx|(^|[;&|\s])nx)\s+reset\b/,
      'nx-reset',
      'Never `nx reset` — it corrupts the shared nx cache for other worktrees. Use `make clean-cache` instead.',
    ],
    [
      /(^|[;&|\s])(npm|yarn)\s+(install|i|ci|add|remove|update|upgrade)\b/,
      'npm-yarn',
      'This repo is pnpm-only (corepack-enforced pnpm 9.12.1). Use pnpm — or better, `make install` / `node scripts/modules-pool/link.mjs`.',
    ],
    [
      /(^|[;&|\s])pnpm\s+(install|i|add|remove|update)\b/,
      'pnpm-install-symlink',
      'Never run pnpm install/add straight through a worktree symlink — it corrupts the node_modules pool. Use `node scripts/modules-pool/link.mjs` or `make install`.',
      pnpmInstallGate,
    ],
    [
      /git\s+clean\b[^\n]*\s-[A-Za-z]*[dxX]/,
      'git-clean-dx',
      '`git clean -d/-x` removes untracked files and destroys worktree symlinks (node_modules, certs). If cache cleanup is the goal, use `make clean-cache`.',
    ],
    [
      /git\s+reset\s+--hard\b/,
      'git-reset-hard',
      '`git reset --hard` irreversibly discards uncommitted work. Confirm the working tree is clean or the loss is intended.',
    ],
    [
      /git\s+(?:-C\s+\S+\s+)*checkout\s+(?:\S+\s+)?--\s+\.\/?(?=\s|$|[;&|])/,
      'git-checkout-whole-tree',
      '`git checkout <ref> -- .` silently overwrites the entire working tree with another ref’s contents, discarding uncommitted changes with no warning (LS-9106, PR #6898 near-miss). Confirm the working tree is clean or the loss is intended. Scoped, single-file checkouts (`git checkout <ref> -- path/to/file.ts`) are unaffected.',
    ],
    [
      /git\s+(?:-C\s+\S+\s+)*restore\b(?:(?!;|&|\||\n).)*?\s\.\/?(?=\s|$|[;&|])/,
      'git-restore-whole-tree',
      '`git restore [--source=<ref>] .` silently overwrites the entire working tree, discarding uncommitted changes with no warning — same hazard as `git reset --hard` (LS-9106, PR #6898 near-miss). Confirm the working tree is clean or the loss is intended. Scoped, single-file restores (`git restore --source=<ref> path/to/file.ts`) are unaffected.',
    ],
    [
      /git\s+stash\s+(drop|clear)\b/,
      'git-stash-drop',
      'Dropping stashes irreversibly discards work. Confirm the stash content is no longer needed.',
    ],
  ];

  for (const [re, rule, message] of CATASTROPHIC) {
    if (re.test(scannable))
      findings.push({ severity: 'CATASTROPHIC', rule, message });
  }
  for (const [re, rule, message, gate] of GUARDED) {
    if (!re.test(scannable)) continue;
    const { fire, message: override } = gate ? gate() : { fire: true };
    if (fire)
      findings.push({
        severity: 'GUARDED',
        rule,
        message: override ?? message,
      });
  }
  if (
    /(^|[;&|\s])rm\s+-[A-Za-z]*r/.test(scannable) &&
    !findings.some((f) => f.rule.startsWith('rm-'))
  ) {
    findings.push({
      severity: 'WARN',
      rule: 'rm-recursive',
      message:
        'Recursive delete — double-check the target path. Ad-hoc output belongs in scratch/ where deletion is always safe.',
    });
  }
  if (
    /chmod\s+(-[A-Za-z]*R[A-Za-z]*\s+)?777\b|chmod\s+777\s+-R\b/.test(scannable)
  ) {
    findings.push({
      severity: 'WARN',
      rule: 'chmod-777',
      message:
        'World-writable permissions are almost never needed; prefer the narrowest mode that works.',
    });
  }
  // SQL keywords only matter in Bash when a DB client is actually invoked.
  if (/\bpsql\b/.test(scannable)) sql = scannable;
}

// --- SQL rules (db_query tools, or psql invocations from Bash) ---
if (sql) {
  if (/\bdrop\s+(table|database|schema|index)\b|\btruncate\s+/i.test(sql)) {
    findings.push({
      severity: 'GUARDED',
      rule: 'sql-drop-truncate',
      message:
        'DROP/TRUNCATE against the shared dev database is destructive for every developer using it. ' +
        'Schema changes belong in a migration (db_migrate) — see .agents/skills/database/SKILL.md.',
    });
  }
  if (/\bdelete\s+from\b/i.test(sql) && !/\bwhere\b/i.test(sql)) {
    findings.push({
      severity: 'WARN',
      rule: 'sql-delete-no-where',
      message:
        'DELETE without a WHERE clause empties the whole table. Confirm that is intended.',
    });
  }
}

if (findings.length === 0) process.exit(0);

// ---------------------------------------------------------------------------
// Resolve highest severity, honour bypass, log, and emit
// ---------------------------------------------------------------------------
const ORDER = { CATASTROPHIC: 0, CORRECTABLE: 1, GUARDED: 2, WARN: 3 };
findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
const top = findings[0];
const NO_BYPASS = new Set(['CATASTROPHIC', 'CORRECTABLE']);
const effectiveBypass = bypassed && !NO_BYPASS.has(top.severity);

// Mask any detected secret material before the text is written anywhere —
// the audit log on disk AND the block message (which lands in the session
// transcript). Only the first 4 characters survive.
function redactSecrets(text) {
  let out = text;
  for (const [re, label] of SECRET_PATTERNS) {
    out = out.replace(
      new RegExp(re.source, 'g'),
      (m) => `${m.slice(0, 4)}…[redacted ${label}]`,
    );
  }
  return out;
}
const safeRaw = redactSecrets(raw);

appendJsonl(join(auditDir(input), 'risk-guard.jsonl'), {
  ts: new Date().toISOString(),
  sessionId: input.session_id,
  tool,
  severity: top.severity,
  rules: findings.map((f) => f.rule),
  bypassed: effectiveBypass,
  snippet: truncate(safeRaw, 200),
});

if (effectiveBypass) process.exit(0);

// A mis-shaped call's own arguments are the thing being corrected, so they are
// shown in full rather than clipped to the 150-char command snippet.
const snippet = truncate(safeRaw, top.severity === 'CORRECTABLE' ? 400 : 150);

if (top.severity === 'WARN') {
  process.stdout.write(
    `[RISK WARNING] ${top.message}\n\n  Command running: ${snippet}\n` +
      `  Add \`# risk-ok: <reason>\` (SQL: \`-- risk-ok\`) to acknowledge and suppress this warning.\n`,
  );
  process.exit(0);
}

const ESCAPE = {
  GUARDED:
    'If you have verified this is intentional and safe, re-run with a `# risk-ok: <reason>` marker (SQL: `-- risk-ok`).',
  CORRECTABLE:
    'Re-issue the call with the corrected shape above — no bypass marker applies here. This is not a ' +
    'judgement that the call is dangerous: it is that the arguments do not mean what they look like ' +
    'they mean, so the result would be wrong rather than refused.',
  CATASTROPHIC:
    'This action has NO bypass. If it is genuinely required, stop and ask the user to run it manually.',
};

// Every CORRECTABLE finding has to be fixed before the call succeeds, and they
// are cheap to fix together — showing only the top one would send the agent
// round the loop once per rule. The risk tiers keep their single-message form:
// there the first finding is the one that decides whether to proceed at all.
const correctableHint = isActionsList
  ? CI_LIST_RUNS_HINT
  : isGetJobLogs
    ? GET_JOB_LOGS_HINT
    : '';
const body =
  top.severity === 'CORRECTABLE'
    ? `${findings.map((f) => f.message).join('\n\n')}${correctableHint ? `\n\n${correctableHint}` : ''}`
    : top.message;

const header =
  top.severity === 'CORRECTABLE' ? '[CALL SHAPE BLOCKED]' : '[RISK BLOCKED]';

// Block messages go to stderr — on exit 2 Claude Code feeds stderr (not stdout)
// back to the agent.
process.stderr.write(
  `${header} ${findings.map((f) => f.rule).join(', ')}\n\n` +
    `${body}\n\n` +
    `Blocked ${tool} call: ${snippet}\n\n${ESCAPE[top.severity]}\n`,
);
process.exit(2);
