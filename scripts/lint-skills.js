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
//     7. SKILL.md size budget — must be <= SKILL_MD_SIZE_BUDGET_BYTES. SKILL.md is
//        always-resident (loaded on every substantive task per AGENTS.md routing),
//        so lookup-table content belongs in references/*.md, loaded on demand.
//        Enforced for every skill: the LS-9822 grandfather list was emptied and
//        removed by LS-9982, which restructured the last 13 oversized skills.
//   WARNINGS (reported, exit 0):
//     4. `file.ext:NNN` line-number citations — cite anchors/symbols instead
//     5. Known-retired tool names (they may legitimately appear when documenting
//        the retirement itself, hence warning not error)
//     6. Spine-ordering restatement heuristic: a non-spine file with a numbered
//        "Step N" sequence that covers both PR creation and validation likely
//        restates the ticket-to-merge spine — link to it instead
//     8. Dangling #fragment anchors: when a relative link carries a #fragment
//        and the target is a markdown file, the fragment must resolve to one
//        of the target's headings (GitHub slug rules) or an explicit
//        `<a id=...>`/`<a name=...>` anchor. Checked for every .md file under
//        .agents/skills/, plus any docs/**/*.md file that links into
//        .agents/skills/. Landed as a WARNING, not an ERROR (LS-10133): the
//        first run against this corpus surfaced ~29 pre-existing dangling
//        anchors well beyond the two that motivated this ticket, matching the
//        ticket's own risk assessment ("land as WARNING first if the initial
//        run surfaces a large backlog, then promote to ERROR once the corpus
//        is clean" — the same staging pattern LS-9822 used for the size
//        budget). The backlog is tracked at LS-10175; promote check 8 to an
//        ERROR once it's empty.
//
// Requires: uvx (from uv) and the skills-ref package on PyPI.
// Run via: make lint-skills  OR  node scripts/lint-skills.js

const { execFileSync } = require('child_process');
const { readdirSync, statSync, existsSync, readFileSync } = require('fs');
const { join, resolve, dirname, relative } = require('path');

const root = resolve(__dirname, '..');
const skillsDir = join(root, '.agents', 'skills');
const docsDir = join(root, 'docs');

const SPINE_FILE = join(
  skillsDir,
  'workflow-overview',
  'references',
  'ticket-to-merge-spine.md',
);

// SKILL.md is always-resident context (loaded on every substantive task, per
// AGENTS.md's "Before starting work, Read .agents/skills/INDEX.md, and load
// every skill whose scope matches"), re-sent on every tool-call round trip and
// re-paid in full after every /compact. Lookup-table content (per-service ops
// tables, exhaustive troubleshooting) belongs in references/*.md, loaded only
// when a task actually matches. 15KB is roughly 3.5-4k tokens; a dispatcher
// SKILL.md (purpose, preconditions, a references table, critical rules) fits
// comfortably under it. See .agents/skills/skill-authoring/SKILL.md.
const SKILL_MD_SIZE_BUDGET_BYTES = 15 * 1024;

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

/**
 * Slugify heading text the way GitHub renders `#fragment` anchors:
 * lowercase, strip anything that isn't a word char/hyphen/space, then turn
 * each remaining space into a hyphen. GitHub does NOT collapse consecutive
 * spaces first, so removing a punctuation character that sat between two
 * spaces (e.g. "Foo / Bar" -> "Foo  Bar") yields a double hyphen
 * ("foo--bar"), not a single one. Duplicate-slug de-duplication (-1, -2,
 * ...) is applied by the caller across a whole file.
 */
function githubSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/ /g, '-'); // each space -> hyphen; runs are NOT collapsed
}

/**
 * Reduce a raw heading/anchor-tag line to the plain text GitHub slugs from:
 * strip a markdown link's brackets (keep the link text), inline code
 * backticks, and bold/italic emphasis markers. Code span content is
 * protected from the emphasis pass — markdown never parses `*`/`_` inside
 * backticks as emphasis, and this corpus's headings routinely backtick
 * snake_case tool names (`ci_get_playwright_report`), whose underscores
 * must not be mistaken for italic markers once unwrapped.
 */
function headingPlainText(text) {
  const codeSpans = [];
  const withLinks = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  const placeheld = withLinks.replace(/`([^`]*)`/g, (_, inner) => {
    codeSpans.push(inner);
    return `\uE000${codeSpans.length - 1}\uE000`;
  });
  const deEmphasized = placeheld
    .replace(/(\*\*\*|___)(.+?)\1/g, '$2')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2');
  return deEmphasized
    .replace(/\uE000(\d+)\uE000/g, (_, i) => codeSpans[Number(i)])
    .trim();
}

/**
 * Collect every anchor a #fragment link into this markdown file could
 * legally target: one slug per ATX heading (`#`..`######`), GitHub-deduped
 * with -1/-2/... suffixes for repeats, plus any explicit
 * `<a id="...">`/`<a name="...">` anchor.
 */
function collectAnchors(rawText) {
  const noFences = stripFenced(rawText);
  const anchors = new Set();
  const slugCounts = new Map();

  for (const line of noFences.split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.*?)\s*$/);
    if (!heading) continue;
    const plain = headingPlainText(heading[1]);
    const base = githubSlug(plain);
    const seen = slugCounts.get(base) ?? 0;
    slugCounts.set(base, seen + 1);
    anchors.add(seen === 0 ? base : `${base}-${seen}`);
  }

  for (const m of rawText.matchAll(
    /<a\s+[^>]*\b(?:id|name)=["']([^"']+)["']/gi,
  )) {
    anchors.add(m[1]);
  }

  return anchors;
}

const anchorCache = new Map(); // absolute .md path -> Set<anchor>
function anchorsFor(absPath) {
  if (!anchorCache.has(absPath)) {
    anchorCache.set(absPath, collectAnchors(readFileSync(absPath, 'utf8')));
  }
  return anchorCache.get(absPath);
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

/**
 * Check 3 (+ check 8): every relative markdown link in `prose` must resolve
 * on disk (ERROR, pushed to `errors`); if it carries a #fragment and
 * resolves to a markdown file, the fragment must also resolve to one of
 * that file's headings/anchors (WARNING, pushed to `warnings` — see check 8
 * above for why this is staged as a warning) (LS-10133).
 */
function checkMarkdownLinks(
  file,
  prose,
  relLabel,
  errors,
  warnings,
  { onlySkillsTargets = false } = {},
) {
  for (const m of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    if (target.includes('<') || target.includes('>')) continue; // placeholder
    const fragment = target.includes('#') ? target.split('#')[1] : '';
    const pathOnly = target.split('#')[0].split('?')[0];
    if (pathOnly === '') continue;
    const abs = pathOnly.startsWith('/')
      ? join(root, pathOnly)
      : join(dirname(file), pathOnly);
    // docs/ files link all over the repo; check 3's extended scope (LS-10133)
    // only owns links into .agents/skills/, so leave every other link in a
    // docs/ file to whatever check eventually covers docs-wide link rot.
    if (onlySkillsTargets && relative(skillsDir, abs).startsWith('..')) {
      continue;
    }
    if (!existsSync(abs)) {
      errors.push({
        file: relLabel,
        msg: `broken link: (${target}) → ${relative(root, abs)} does not exist`,
      });
      continue;
    }
    if (fragment && abs.endsWith('.md')) {
      const anchors = anchorsFor(abs);
      if (!anchors.has(fragment)) {
        warnings.push({
          file: relLabel,
          msg:
            `dangling anchor: (${target}) → #${fragment} does not resolve ` +
            `to a heading or explicit anchor in ${relative(root, abs)}`,
        });
      }
    }
  }
}

function main() {
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

      // 7. SKILL.md size budget — always-resident content must stay thin
      const sizeBytes = Buffer.byteLength(skillMdText, 'utf8');
      if (sizeBytes > SKILL_MD_SIZE_BUDGET_BYTES) {
        const msg =
          `${(sizeBytes / 1024).toFixed(1)}KB exceeds the ${SKILL_MD_SIZE_BUDGET_BYTES / 1024}KB ` +
          `SKILL.md size budget — move lookup-table/reference content into ` +
          `references/*.md and leave SKILL.md a thin dispatcher. See ` +
          `skill-authoring/SKILL.md.`;
        errors.push({ file: `${name}/SKILL.md`, msg });
      }
    }

    for (const file of mdFiles(skillPath)) {
      const rel = relative(skillsDir, file);
      const raw = readFileSync(file, 'utf8');
      const noFences = stripFenced(raw);
      const prose = stripInlineCode(noFences); // outside code blocks AND spans

      // 3. Relative markdown links (path + #fragment) must resolve
      checkMarkdownLinks(file, prose, rel, errors, warnings);

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

  // 3 (extended scope): docs/**/*.md files that link into .agents/skills/ get
  // the same path + #fragment link check, restricted to those specific links
  // (LS-10133) — a docs/ file's other links are out of this check's scope.
  // Other checks (line-number citations, retired tools, spine restatement) are
  // skill-corpus-specific and stay scoped to .agents/skills/.
  for (const file of mdFiles(docsDir)) {
    const raw = readFileSync(file, 'utf8');
    if (!raw.includes('.agents/skills')) continue; // cheap pre-filter
    const rel = relative(root, file);
    const prose = stripInlineCode(stripFenced(raw));
    checkMarkdownLinks(file, prose, rel, errors, warnings, {
      onlySkillsTargets: true,
    });
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
}

// Export the pure helpers for unit testing; only run the CLI when invoked
// directly (node scripts/lint-skills.js), not when require()'d by a test.
module.exports = {
  githubSlug,
  headingPlainText,
  collectAnchors,
  checkMarkdownLinks,
};

if (require.main === module) {
  main();
}
