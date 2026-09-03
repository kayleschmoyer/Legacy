#!/usr/bin/env node
// Validate all agent skills under .agents/skills/.
//
// Checks (see .agents/skills/skill-authoring/SKILL.md "Anti-drift rules"):
//   ERRORS (exit 1):
//     1. Official agentskills validator (uvx --from skills-ref agentskills validate)
//     2. Frontmatter `name:` must equal the skill directory name
//     2b. Frontmatter must declare `metadata.scope` — the path-glob routing scope
//         consumed by scripts/generate-skill-index.mjs (INDEX.md drift is checked
//         separately by .github/checks/skill-index-sync.sh)
//     3. Relative markdown links (outside code blocks/spans) must resolve on disk
//   WARNINGS (reported, exit 0):
//     4. `file.ext:NNN` line-number citations — cite anchors/symbols instead
//     5. Known-retired tool names (they may legitimately appear when documenting
//        the retirement itself, hence warning not error)
//     6. Spine-ordering restatement heuristic: a non-spine file with a numbered
//        "Step N" sequence that covers both PR creation and validation likely
//        restates the ticket-to-merge spine — link to it instead
//
// Requires: uvx (from uv) and the skills-ref package on PyPI.
// Run via: make lint-skills  OR  node scripts/lint-skills.js

const { execFileSync } = require('child_process');
const { readdirSync, statSync, existsSync, readFileSync } = require('fs');
const { join, resolve, dirname, relative } = require('path');

const root = resolve(__dirname, '..');
const skillsDir = join(root, '.agents', 'skills');

const SPINE_FILE = join(
  skillsDir,
  'workflow-overview',
  'references',
  'ticket-to-merge-spine.md',
);

// Tool names retired from the MCP servers / harness. Mentions are warnings,
// not errors, because docs may legitimately name them when documenting the
// retirement (e.g. "github_pr_files was replaced by github_pr_diff").
// NOTE: ScheduleWakeup was listed here but is NOT retired — it still ships as a
// harness tool scoped to /loop dynamic pacing (verified 2026-09-03). It is simply
// not a PR/CI wait primitive; that rule lives in
// .agents/skills/mcp-first/references/waiting-and-wakeups.md.
const RETIRED_TOOL_PATTERNS = [
  { name: 'github_list_review_threads', re: /\bgithub_list_review_threads\b/ },
  {
    name: 'github_resolve_thread (singular)',
    re: /\bgithub_resolve_thread\b(?!s)/,
  },
  { name: 'github_pr_files', re: /\bgithub_pr_files\b/ },
];

// Skip third-party skills managed via skills-lock.json — they may use
// frontmatter fields not in the agentskills spec (e.g. user-invocable, argument-hint).
const lockPath = join(root, 'skills-lock.json');
let thirdPartySkills = new Set();
if (existsSync(lockPath)) {
  try {
    thirdPartySkills = new Set(
      Object.keys(JSON.parse(readFileSync(lockPath, 'utf8')).skills ?? {}),
    );
  } catch (e) {
    console.error(`Warning: could not parse skills-lock.json: ${e.message}`);
  }
}

const dirs = readdirSync(skillsDir).filter(
  (name) =>
    statSync(join(skillsDir, name)).isDirectory() &&
    !thirdPartySkills.has(name),
);

/** Recursively collect .md files under a directory. */
function mdFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...mdFiles(p));
    else if (entry.endsWith('.md')) out.push(p);
  }
  return out;
}

/** Remove fenced code blocks (``` ... ```). */
function stripFenced(text) {
  return text.replace(/^```.*?^```/gms, '');
}

/** Remove inline code spans (`...`). */
function stripInlineCode(text) {
  return text.replace(/`[^`\n]*`/g, '');
}

/** Extract the frontmatter `name:` value from a SKILL.md, or null. */
function frontmatterName(text) {
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^name:\s*['"]?([\w-]+)['"]?\s*$/m);
  return m ? m[1] : null;
}

/** Parse the full frontmatter block as YAML, or null if absent/invalid. */
function frontmatterData(text) {
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  try {
    return require('yaml').parse(fm[1]);
  } catch {
    return null; // invalid YAML — the agentskills validator reports it
  }
}

const errors = []; // { file, msg }
const warnings = []; // { file, msg }
let validatorPassed = 0;
let validatorFailed = 0;

for (const name of dirs) {
  const skillPath = join(skillsDir, name);

  // 1. Official validator
  try {
    execFileSync(
      'uvx',
      ['--from', 'skills-ref', 'agentskills', 'validate', skillPath],
      { stdio: 'pipe' },
    );
    validatorPassed++;
  } catch (err) {
    validatorFailed++;
    const msg = (err.stderr ?? err.stdout ?? err.message ?? '')
      .toString()
      .trim();
    errors.push({ file: name, msg: `agentskills validate: ${msg}` });
  }

  // 2. frontmatter name === directory name
  const skillMd = join(skillPath, 'SKILL.md');
  if (existsSync(skillMd)) {
    const skillMdText = readFileSync(skillMd, 'utf8');
    const fmName = frontmatterName(skillMdText);
    if (fmName !== null && fmName !== name) {
      errors.push({
        file: `${name}/SKILL.md`,
        msg: `frontmatter name '${fmName}' does not match directory name '${name}'`,
      });
    }

    // 2b. metadata.scope is the routing source of truth for INDEX.md
    const fmData = frontmatterData(skillMdText);
    if (fmData !== null && !fmData?.metadata?.scope) {
      errors.push({
        file: `${name}/SKILL.md`,
        msg:
          `frontmatter has no metadata.scope — every skill must declare its ` +
          `path-glob routing scope ('**' = repo-wide), then run ` +
          `'make sync-skill-index'. See skill-authoring/SKILL.md.`,
      });
    }
  }

  for (const file of mdFiles(skillPath)) {
    const rel = relative(skillsDir, file);
    const raw = readFileSync(file, 'utf8');
    const noFences = stripFenced(raw);
    const prose = stripInlineCode(noFences); // outside code blocks AND spans

    // 3. Relative markdown links must resolve
    for (const m of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
      let target = m[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      if (target.includes('<') || target.includes('>')) continue; // placeholder
      target = target.split('#')[0].split('?')[0];
      if (target === '') continue;
      const abs = target.startsWith('/')
        ? join(root, target)
        : join(dirname(file), target);
      if (!existsSync(abs)) {
        errors.push({
          file: rel,
          msg: `broken link: (${m[1]}) → ${relative(root, abs)} does not exist`,
        });
      }
    }

    // 4. Line-number citations (anchor/symbol citations rot-proof; :NNN rots)
    const lineCites = new Set();
    for (const m of noFences.matchAll(
      /[\w./\\-]+\.(?:md|ts|tsx|js|jsx|mjs|cjs|mts|json|ya?ml|sh|graphql|sql):\d+(?:-\d+)?/g,
    )) {
      lineCites.add(m[0]);
    }
    if (lineCites.size > 0) {
      warnings.push({
        file: rel,
        msg: `line-number citation(s) — cite anchors/symbols instead: ${[...lineCites].join(', ')}`,
      });
    }

    // 5. Retired tool names
    for (const { name: toolName, re } of RETIRED_TOOL_PATTERNS) {
      if (re.test(raw)) {
        warnings.push({
          file: rel,
          msg: `mentions retired tool '${toolName}' — verify against the live server registry`,
        });
      }
    }

    // 6. Spine-ordering restatement heuristic (skip the spine itself)
    if (resolve(file) !== resolve(SPINE_FILE)) {
      const stepMentions = [...prose.matchAll(/(?<![Ss]pine )\bStep\s+\d+/g)];
      const mentionsPr =
        /\bdraft PR\b|\bopen (?:a |the )?(?:draft )?PR\b|create-pr/i.test(
          prose,
        );
      const mentionsValidate =
        /\bvalidat|make pc\b|pc-chunk|nx_run_pc_chunk/i.test(prose);
      if (stepMentions.length >= 3 && mentionsPr && mentionsValidate) {
        warnings.push({
          file: rel,
          msg:
            `possible spine-ordering restatement (${stepMentions.length} 'Step N' mentions + PR + validation) — ` +
            'ordering has one home: workflow-overview/references/ticket-to-merge-spine.md',
        });
      }
    }
  }
}

if (warnings.length > 0) {
  console.log(`\n⚠ ${warnings.length} warning(s):`);
  for (const { file, msg } of warnings) {
    console.log(`  ⚠ ${file}: ${msg}`);
  }
}

if (errors.length > 0) {
  for (const { file, msg } of errors) {
    console.error(`\n✖ ${file}`);
    console.error(`  ${msg.replace(/\n/g, '\n  ')}`);
  }
  console.error(
    `\n${errors.length} error(s) across ${validatorFailed} validator failure(s) and ${errors.length - validatorFailed} lint failure(s); ${validatorPassed} skills passed the official validator.`,
  );
  process.exit(1);
} else {
  console.log(
    `✔ All ${validatorPassed} skills are valid (${warnings.length} warning(s)).`,
  );
}
