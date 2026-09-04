#!/usr/bin/env node
/**
 * PreToolUse hook: risk guard for destructive / irreversible / policy-violating
 * tool calls. Complements the existing narrow guards (guard-main-repo,
 * guard-make-pc, enforce-background) with a general safety net.
 *
 * Matched tools (see .claude/settings.json matcher):
 *   Bash, Edit, Write, NotebookEdit, and the db_query MCP tools.
 *
 * Three severity tiers:
 *   CATASTROPHIC — blocked, no bypass (exit 2). rm -rf on root/home/.git,
 *     force pushes, any push to main, secret material embedded in tool args.
 *   GUARDED — blocked (exit 2) but bypassable with a `# risk-ok: <reason>`
 *     marker (SQL: `-- risk-ok`) once the agent has verified the action is
 *     intentional. Covers repo Tier-1/2 rules: manual worktree removal,
 *     nx reset, npm/yarn usage, pnpm install through worktree symlinks,
 *     git clean -dx, git reset --hard, DROP/TRUNCATE.
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

if (tool === 'Bash') command = String(ti.command ?? '');
else if (tool === 'Edit') content = String(ti.new_string ?? '');
else if (tool === 'Write') content = String(ti.content ?? '');
else if (tool === 'NotebookEdit') content = String(ti.new_source ?? '');
else if (/__db_query$/.test(tool)) sql = String(ti.sql ?? ti.query ?? '');

const raw = command || sql || content;
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
 */
function pnpmInstallGate() {
  const root = projectDir(input);
  try {
    // lstat, not stat: Windows junctions (what modules-pool/link.mjs creates)
    // also report as symbolic links here, but resolve away under stat.
    return lstatSync(join(root, 'node_modules')).isSymbolicLink()
      ? { fire: true }
      : { fire: false };
  } catch (err) {
    if (err?.code !== 'ENOENT') return { fire: false }; // fail open
    // No node_modules. In the main repo a real install is the legitimate one.
    if (!isLinkedWorktree(root)) return { fire: false };
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

const findings = [];

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
      /git\s+(?:-C\s+\S+\s+)*push\b(?=[^\n]*(--force(?!-with-lease)\b|\s-f\b))/,
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
const ORDER = { CATASTROPHIC: 0, GUARDED: 1, WARN: 2 };
findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
const top = findings[0];
const effectiveBypass = bypassed && top.severity !== 'CATASTROPHIC';

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

const snippet = truncate(safeRaw, 150);

if (top.severity === 'WARN') {
  process.stdout.write(
    `[RISK WARNING] ${top.message}\n\n  Command running: ${snippet}\n` +
      `  Add \`# risk-ok: <reason>\` (SQL: \`-- risk-ok\`) to acknowledge and suppress this warning.\n`,
  );
  process.exit(0);
}

const escape =
  top.severity === 'GUARDED'
    ? 'If you have verified this is intentional and safe, re-run with a `# risk-ok: <reason>` marker (SQL: `-- risk-ok`).'
    : 'This action has NO bypass. If it is genuinely required, stop and ask the user to run it manually.';

// Block messages go to stderr — on exit 2 Claude Code feeds stderr (not stdout)
// back to the agent.
process.stderr.write(
  `[RISK BLOCKED] ${findings.map((f) => f.rule).join(', ')}\n\n` +
    `${top.message}\n\n` +
    `Blocked ${tool} call: ${snippet}\n\n${escape}\n`,
);
process.exit(2);
