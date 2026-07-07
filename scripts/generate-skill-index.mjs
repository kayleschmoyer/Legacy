#!/usr/bin/env node
// Generate the skill routing index from SKILL.md frontmatter.
//
// `.agents/skills/<name>/SKILL.md` frontmatter is the single source of truth
// for skill routing (anti-drift rule 1, "one home per fact" — see
// .agents/skills/skill-authoring/SKILL.md):
//
//   description     -> the "Load when" trigger text
//   metadata.scope  -> comma-separated path globs (`**` = repo-wide)
//   metadata.deprecated -> 'true' for tombstone pointers kept for inbound links
//
// This script derives `.agents/skills/INDEX.md` — the routing table agents
// read at task start instead of an eager table in AGENTS.md (LS-8355;
// design record: docs/dev-process/skill-routing.md).
//
// INDEX.md is listed in .prettierignore (like the generated agent prompts):
// it is byte-exact output of this script and reformatting would break the
// drift check.
//
// Usage:
//   node scripts/generate-skill-index.mjs           # (re)generate INDEX.md
//   node scripts/generate-skill-index.mjs --check   # exit 1 if stale
//
// Make targets: `make sync-skill-index` / `make lint-skill-index`.
// CI: .github/checks/skill-index-sync.sh runs --check on every PR.

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(root, '.agents', 'skills');
const indexPath = join(skillsDir, 'INDEX.md');
const checkMode = process.argv.includes('--check');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function frontmatter(text, file) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) fail(`${file}: no frontmatter block`);
  try {
    return parseYaml(m[1]);
  } catch (e) {
    fail(`${file}: frontmatter is not valid YAML: ${e.message}`);
  }
}

/** Markdown-table-safe single-line cell text. */
function cell(text) {
  return text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}

const skills = [];
for (const name of readdirSync(skillsDir).sort()) {
  const dir = join(skillsDir, name);
  if (!statSync(dir).isDirectory()) continue;
  const skillMd = join(dir, 'SKILL.md');
  if (!existsSync(skillMd)) fail(`${name}: missing SKILL.md`);
  const fm = frontmatter(readFileSync(skillMd, 'utf8'), `${name}/SKILL.md`);
  if (!fm?.description)
    fail(`${name}/SKILL.md: frontmatter has no description`);
  const scope = fm?.metadata?.scope;
  if (!scope) {
    fail(
      `${name}/SKILL.md: frontmatter has no metadata.scope — every skill must ` +
        `declare its path scope ('**' = repo-wide). See skill-authoring/SKILL.md.`,
    );
  }
  skills.push({
    name,
    scope,
    description: fm.description,
    deprecated: String(fm?.metadata?.deprecated) === 'true',
  });
}

// Repo-wide skills first (alphabetical), then path-scoped (alphabetical);
// deprecated tombstones drop to a trailing list.
const active = skills.filter((s) => !s.deprecated);
const deprecated = skills.filter((s) => s.deprecated);
const rows = [
  ...active.filter((s) => s.scope === '**'),
  ...active.filter((s) => s.scope !== '**'),
];

const lines = [
  '<!-- AUTO-GENERATED — DO NOT EDIT.',
  '     Source of truth: the frontmatter (description + metadata.scope) of each',
  '     .agents/skills/<name>/SKILL.md. Regenerate with `make sync-skill-index`',
  '     (node scripts/generate-skill-index.mjs). CI fails on drift',
  '     (.github/checks/skill-index-sync.sh). -->',
  '',
  '# Skill Routing Index',
  '',
  'One row per skill under `.agents/skills/`. **Scope** is the set of path globs the',
  'skill applies to (`**` = repo-wide); **Load when** is the trigger for `Read`ing the',
  "skill's SKILL.md before proceeding. Routing contract: [AGENTS.md § Skills](../../AGENTS.md#skills).",
  '',
  '| Scope | Skill | Load when |',
  '| ----- | ----- | --------- |',
];
for (const s of rows) {
  lines.push(
    `| \`${cell(s.scope)}\` | [\`${s.name}\`](${s.name}/SKILL.md) | ${cell(s.description)} |`,
  );
}
lines.push(
  '',
  '## Deprecated pointers',
  '',
  'Tombstones kept for inbound links — read the successor skill instead.',
  '',
);
for (const s of deprecated) {
  lines.push(`- [\`${s.name}\`](${s.name}/SKILL.md) — ${cell(s.description)}`);
}
lines.push('');

const output = lines.join('\n');

if (checkMode) {
  const current = existsSync(indexPath)
    ? readFileSync(indexPath, 'utf8')
    : null;
  if (current !== output) {
    fail(
      `.agents/skills/INDEX.md is stale. A SKILL.md frontmatter (description or ` +
        `metadata.scope) changed without regenerating the index.\n` +
        `Run: make sync-skill-index  (node scripts/generate-skill-index.mjs) and commit the result.`,
    );
  }
  console.log(
    `✔ .agents/skills/INDEX.md is in sync (${rows.length} active skills, ${deprecated.length} deprecated).`,
  );
} else {
  writeFileSync(indexPath, output);
  console.log(
    `Wrote .agents/skills/INDEX.md (${rows.length} active skills, ${deprecated.length} deprecated).`,
  );
}
