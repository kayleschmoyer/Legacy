#!/usr/bin/env node
// Sync agent slash-command prompts from the single source of truth.
//
// `.claude/commands/*.md` is the canonical definition of every slash command.
// This script derives the equivalent command/prompt files for the other agent
// environments supported by this repo (see docs/dev-process/llm-environments.md):
//
//   Copilot (VS Code / github.com)  -> .github/prompts/<name>.prompt.md
//   Cursor                          -> .cursor/commands/<name>.md
//   OpenCode                        -> .opencode/commands/<name>.md
//   Codex CLI                       -> .codex/prompts/<name>.md  (see note below)
//
// Codex note: Codex only loads custom prompts from ~/.codex/prompts (global,
// deprecated in favor of skills). The generated .codex/prompts/ directory is
// checked in so local users can symlink or copy it into ~/.codex/prompts.
//
// Canonical frontmatter keys (in .claude/commands/*.md):
//   description    -> propagated to every target that supports frontmatter
//   argument-hint  -> propagated to Codex; already surfaced in prose elsewhere
//   agents         -> optional comma-separated allowlist of targets
//                     (e.g. `agents: 'claude'` keeps a command Claude-only)
//
// Body transforms (applied OUTSIDE fenced code blocks only, so embedded chip
// prompt templates — which are executed by Claude chips — stay intact):
//   Skill(skill: "x")       -> `.agents/skills/x/SKILL.md` if the skill exists,
//                              else the target's own generated file for command x
//   Read(file_path: "y")    -> `y`
//   $ARGUMENTS              -> ${input:args} (Copilot), <args> + note (Cursor),
//                              unchanged (OpenCode, Codex — natively supported)
//
// Usage:
//   node scripts/sync-agent-prompts.mjs           # (re)generate all targets
//   node scripts/sync-agent-prompts.mjs --check   # exit 1 if anything is stale
//
// Make targets: `make sync-agent-prompts` / `make lint-agent-prompts`.
// CI: .github/checks/agent-prompts-sync.sh runs --check on every PR.

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(root, '.claude', 'commands');
const SKILLS_DIR = join(root, '.agents', 'skills');

const BANNER_MARKER = 'AUTO-GENERATED — DO NOT EDIT';

const TARGETS = {
  copilot: {
    dir: join(root, '.github', 'prompts'),
    file: (name) => `${name}.prompt.md`,
    commandPath: (name) => `.github/prompts/${name}.prompt.md`,
  },
  cursor: {
    dir: join(root, '.cursor', 'commands'),
    file: (name) => `${name}.md`,
    commandPath: (name) => `.cursor/commands/${name}.md`,
  },
  opencode: {
    dir: join(root, '.opencode', 'commands'),
    file: (name) => `${name}.md`,
    commandPath: (name) => `.opencode/commands/${name}.md`,
  },
  codex: {
    dir: join(root, '.codex', 'prompts'),
    file: (name) => `${name}.md`,
    commandPath: (name) => `.codex/prompts/${name}.md`,
  },
};

const ALL_AGENT_KEYS = ['claude', ...Object.keys(TARGETS)];

function fail(msg) {
  console.error(`sync-agent-prompts: ${msg}`);
  process.exit(1);
}

// --- Parse a canonical command file ---------------------------------------

function parseCommand(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    fail(`${filePath} has no YAML frontmatter block`);
  }
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1).replace(/''/g, "'");
    }
    frontmatter[kv[1]] = value;
  }
  const body = raw.slice(match[0].length);
  return { frontmatter, body };
}

function agentsFor(frontmatter, name) {
  if (!frontmatter.agents) return ALL_AGENT_KEYS;
  const agents = frontmatter.agents
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  for (const a of agents) {
    if (!ALL_AGENT_KEYS.includes(a)) {
      fail(
        `${name}: unknown agent '${a}' in frontmatter (known: ${ALL_AGENT_KEYS.join(', ')})`,
      );
    }
  }
  if (!agents.includes('claude')) {
    fail(
      `${name}: 'claude' must always be listed — .claude/commands is the source of truth`,
    );
  }
  return agents;
}

// --- Body transforms --------------------------------------------------------

// Apply `transform` to every line that is NOT inside a fenced code block.
// Chip prompt templates and shell examples live in fences and are executed
// verbatim by Claude chips — they must never be rewritten for other agents.
function transformOutsideFences(body, transform) {
  const lines = body.split('\n');
  let inFence = false;
  return lines
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : transform(line);
    })
    .join('\n');
}

function resolveSkillReference(skillName, target, sourceName) {
  if (existsSync(join(SKILLS_DIR, skillName, 'SKILL.md'))) {
    return `the skill file \`.agents/skills/${skillName}/SKILL.md\``;
  }
  if (existsSync(join(SOURCE_DIR, `${skillName}.md`))) {
    return `the \`/${skillName}\` command prompt (\`${TARGETS[target].commandPath(skillName)}\`)`;
  }
  fail(
    `${sourceName}: Skill(skill: "${skillName}") does not resolve to ` +
      `.agents/skills/${skillName}/SKILL.md or .claude/commands/${skillName}.md`,
  );
}

function transformBody(body, target, sourceName) {
  let out = transformOutsideFences(body.replace(/^\s+/, ''), (line) =>
    line
      // `Skill(skill: "x")` (with or without surrounding backticks)
      .replace(/`?Skill\(skill:\s*"([A-Za-z0-9_-]+)"\)`?/g, (_, skillName) =>
        resolveSkillReference(skillName, target, sourceName),
      )
      // `Read(file_path: "y")` (with or without surrounding backticks)
      .replace(/`?Read\(file_path:\s*"([^"]+)"\)`?/g, '`$1`')
      // Links relative to .claude/commands/ (e.g. `](./work-ticket.md)`) break
      // in the mirror directories — point them back at the canonical file.
      // `../../` links are fine: every mirror dir is exactly two levels deep.
      .replace(/\]\(\.\/([^)]+\.md)\)/g, '](../../.claude/commands/$1)'),
  );

  const usesArguments = out.includes('$ARGUMENTS');
  if (target === 'copilot') {
    out = transformOutsideFences(out, (line) =>
      line.replace(/\$ARGUMENTS/g, '${input:args}'),
    );
  } else if (target === 'cursor') {
    out = transformOutsideFences(out, (line) =>
      line.replace(/\$ARGUMENTS/g, '<args>'),
    );
    if (usesArguments) {
      out =
        '> **Arguments**: wherever `<args>` appears below, substitute the text the user typed after the slash command.\n\n' +
        out;
    }
  }
  // opencode + codex support $ARGUMENTS natively — leave as-is.
  return out;
}

function yamlQuote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function banner(name) {
  return [
    '<!--',
    `  ${BANNER_MARKER}.`,
    `  Source of truth: .claude/commands/${name}.md — edit that file instead.`,
    '  Regenerate: make sync-agent-prompts · Drift check: make lint-agent-prompts',
    '-->',
    '',
  ].join('\n');
}

function render(name, frontmatter, body, target) {
  const transformed = transformBody(body, target, name);
  const fm = [];
  if (target === 'copilot') {
    fm.push(`mode: 'agent'`);
    if (frontmatter.description)
      fm.push(`description: ${yamlQuote(frontmatter.description)}`);
  } else if (target === 'opencode') {
    if (frontmatter.description)
      fm.push(`description: ${yamlQuote(frontmatter.description)}`);
  } else if (target === 'codex') {
    if (frontmatter.description)
      fm.push(`description: ${yamlQuote(frontmatter.description)}`);
    if (frontmatter['argument-hint'])
      fm.push(`argument-hint: ${yamlQuote(frontmatter['argument-hint'])}`);
  }
  const head = fm.length > 0 ? `---\n${fm.join('\n')}\n---\n\n` : '';
  return `${head}${banner(name)}\n${transformed.trim()}\n`;
}

// --- Main -------------------------------------------------------------------

const checkMode = process.argv.includes('--check');

const sources = readdirSync(SOURCE_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort();

const expected = new Map(); // absolute path -> content
for (const file of sources) {
  const name = basename(file, '.md');
  const { frontmatter, body } = parseCommand(join(SOURCE_DIR, file));
  const agents = agentsFor(frontmatter, name);
  for (const [target, cfg] of Object.entries(TARGETS)) {
    if (!agents.includes(target)) continue;
    expected.set(
      join(cfg.dir, cfg.file(name)),
      render(name, frontmatter, body, target),
    );
  }
}

// Managed files currently on disk (banner-carrying only, so hand-authored
// files in shared dirs like .github/prompts are never treated as orphans).
const onDisk = new Set();
for (const cfg of Object.values(TARGETS)) {
  if (!existsSync(cfg.dir)) continue;
  for (const f of readdirSync(cfg.dir)) {
    if (!f.endsWith('.md')) continue;
    const p = join(cfg.dir, f);
    if (readFileSync(p, 'utf8').includes(BANNER_MARKER)) onDisk.add(p);
  }
}

const stale = [];
const orphans = [...onDisk].filter((p) => !expected.has(p));
for (const [path, content] of expected) {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current !== content) stale.push(path);
}

const rel = (p) => p.slice(root.length + 1).replace(/\\/g, '/');

if (checkMode) {
  if (stale.length === 0 && orphans.length === 0) {
    console.log(
      `✔ Agent prompts in sync (${expected.size} generated files from ${sources.length} commands).`,
    );
    process.exit(0);
  }
  for (const p of stale) console.error(`✖ stale or missing: ${rel(p)}`);
  for (const p of orphans)
    console.error(`✖ orphaned (source command removed): ${rel(p)}`);
  console.error(
    '\nGenerated agent prompts are out of sync with .claude/commands/.\n' +
      'Run `make sync-agent-prompts` (node scripts/sync-agent-prompts.mjs) and commit the result.',
  );
  process.exit(1);
}

for (const [path, content] of expected) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}
for (const p of orphans) unlinkSync(p);
console.log(
  `✔ Wrote ${expected.size} generated prompt files (${stale.length} updated, ${orphans.length} orphan(s) removed).`,
);
