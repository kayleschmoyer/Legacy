#!/usr/bin/env node
// Theme-compliance ratchet (LS-8519).
//
// Counts theme violations per project against the committed baseline in
// scripts/theme-compliance-baseline.json and fails when any count INCREASES.
// Decreases must be locked in by regenerating the baseline in the same PR, so
// progress is monotonic (betterer-style ratchet).
//
// Violation classes (see docs/design/brand.md and .agents/skills/ui/SKILL.md):
//   rawHex    — hex color literals ('#0A0F1A', '#fff') in component code.
//               Colors must come from Tamagui theme tokens ($surfaceCard, …)
//               or var(--token) in raw-CSS strings, so both themes render.
//   rawRgba   — rgb()/rgba() literals in component code (same rule).
//   blueToken — $blue1–$blue12 Tamagui tokens (generic Tailwind blue; banned
//               by the brand — use $brandNavy*/$brandGold* tokens).
//   themeBlue — theme="blue" prop (same ban).
//
// Scanned projects: apps/web/src, apps/app/src, lib/shared-components/src
// (.ts/.tsx only; specs/stories/tests excluded — see EXCLUDE_FILE below).
// lib/design-tokens and lib/tamagui-config are the sanctioned palette homes
// and are not scanned. nflTeams.ts holds third-party team brand data.
//
// Usage:
//   node scripts/check-theme-compliance.mjs            # check against baseline
//   node scripts/check-theme-compliance.mjs --update   # regenerate baseline
//
// Make targets: `make lint-theme-compliance` / `make update-theme-baseline`.
// CI: .github/checks/theme-compliance.sh runs the check on every PR.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve, dirname, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'scripts', 'theme-compliance-baseline.json');

export const PROJECTS = [
  { name: 'apps/web', dir: 'apps/web/src' },
  { name: 'apps/app', dir: 'apps/app/src' },
  { name: 'lib/shared-components', dir: 'lib/shared-components/src' },
];

export const CLASSES = ['rawHex', 'rawRgba', 'blueToken', 'themeBlue'];

// Files that legitimately hold raw color values (third-party brand data).
const ALLOWLIST = new Set(['lib/shared-components/src/constants/nflTeams.ts']);

const EXCLUDE_FILE =
  /\.(spec|stories|test)\.[jt]sx?$|(^|[\\/])(__tests__|test-setup)[\\/.]/;
const EXCLUDE_DIR = new Set(['node_modules', 'dist', '.expo', 'coverage']);

/** Strip line comments and full-line block-comment bodies so doc references
 *  to hex values ("// mirrors #C5A55A") don't count as violations. Crude but
 *  monotone: it can only under-count, never flag a comment as code. */
export function stripComments(line) {
  const trimmed = line.trimStart();
  if (/^(\/\/|\/?\*)/.test(trimmed)) return '';
  return line.replace(/\/\/.*$/, '');
}

/**
 * Classify one line of code. Returns the list of violation classes present.
 *
 * rawHex: 6/8-digit hex anywhere; 3/4-digit hex only when quote-adjacent
 * (so issue references like "#6112" in strings of prose don't match, while
 * '#fff' does).
 */
export function classifyLine(line) {
  const code = stripComments(line);
  if (!code) return [];
  const found = [];
  if (
    /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b/.test(code) ||
    /['"`]#[0-9a-fA-F]{3,4}['"`]/.test(code)
  ) {
    found.push('rawHex');
  }
  if (/\brgba?\(/.test(code)) found.push('rawRgba');
  if (/\$blue\d{1,2}\b/.test(code)) found.push('blueToken');
  if (/\btheme\s*[:=]\s*["']blue["']/.test(code)) found.push('themeBlue');
  return found;
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIR.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (/\.tsx?$/.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

export function scanProject(projectDir, rootDir = root) {
  const counts = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  const perFile = new Map();
  const abs = join(rootDir, ...projectDir.split('/'));
  if (!existsSync(abs)) return { counts, perFile };
  for (const file of walk(abs)) {
    const rel = relative(rootDir, file).split(sep).join('/');
    if (EXCLUDE_FILE.test(rel) || ALLOWLIST.has(rel)) continue;
    let fileTotal = 0;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      for (const cls of classifyLine(line)) {
        counts[cls] += 1;
        fileTotal += 1;
      }
    }
    if (fileTotal > 0) perFile.set(rel, fileTotal);
  }
  return { counts, perFile };
}

function scanAll() {
  const result = {};
  for (const { name, dir } of PROJECTS) {
    result[name] = scanProject(dir).counts;
  }
  return result;
}

function main() {
  const update = process.argv.includes('--update');
  const current = scanAll();

  if (update) {
    writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`Baseline written to ${relative(root, baselinePath)}:`);
    console.log(JSON.stringify(current, null, 2));
    return;
  }

  if (!existsSync(baselinePath)) {
    console.error(
      'No baseline found. Run `node scripts/check-theme-compliance.mjs --update` and commit the result.',
    );
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

  const regressions = [];
  const improvements = [];
  for (const { name } of PROJECTS) {
    for (const cls of CLASSES) {
      const was = baseline[name]?.[cls] ?? 0;
      const now = current[name]?.[cls] ?? 0;
      if (now > was) regressions.push({ name, cls, was, now });
      else if (now < was) improvements.push({ name, cls, was, now });
    }
  }

  for (const { name, cls, was, now } of regressions) {
    console.error(
      `REGRESSION  ${name} ${cls}: ${was} -> ${now} (+${now - was})`,
    );
  }
  for (const { name, cls, was, now } of improvements) {
    console.error(
      `IMPROVEMENT ${name} ${cls}: ${was} -> ${now} (-${was - now}) — lock it in`,
    );
  }

  if (regressions.length > 0) {
    console.error(
      '\nTheme-compliance check failed: this change adds hardcoded colors or ' +
        'banned tokens.\nUse Tamagui theme tokens ($surfaceCard, $brandNavy, ' +
        '$textMuted, …) or var(--token) in raw-CSS strings so both light and ' +
        'dark themes render correctly.\nSee .agents/skills/ui/SKILL.md ' +
        '(epic LS-8518).',
    );
    process.exit(1);
  }
  if (improvements.length > 0) {
    console.error(
      '\nViolation counts DECREASED (nice) but the baseline was not updated.\n' +
        'Run `make update-theme-baseline` (or `node scripts/check-theme-compliance.mjs --update`)\n' +
        'and commit scripts/theme-compliance-baseline.json in this PR so the progress is locked in.',
    );
    process.exit(1);
  }
  console.log('Theme-compliance check passed (no count increased).');
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
