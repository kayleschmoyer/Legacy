#!/usr/bin/env node
/**
 * JSX/TSX inline style preprocessor for impeccable CLI (LS-3192)
 *
 * The upstream `npx impeccable detect` tool scans CSS string literals and HTML
 * attributes but silently misses React inline `style={{}}` props — where keys
 * are camelCase JS identifiers (e.g., WebkitBackgroundClip) and values are
 * quoted strings. This wrapper adds that missing pass.
 *
 * Usage (mirrors `npx impeccable detect`):
 *   node scripts/impeccable-tsx.mjs [--json] [--fast] <file-or-dir...>
 *
 * For each .tsx/.jsx target the wrapper:
 *   1. Runs `npx impeccable detect` on the original file (existing regex patterns)
 *   2. Extracts all `style={{...}}` blocks, converts JS camelCase props → CSS
 *   3. Writes a temp .css file and runs impeccable on it (block-context mode
 *      catches multi-property patterns like gradient-text across adjacent lines)
 *   4. Maps temp-file findings back to original file + line numbers
 *   5. Merges, deduplicates, and outputs combined results
 *
 * Non-TSX/JSX files are forwarded unchanged to `npx impeccable detect`.
 *
 * Exit codes: 0 = clean, 2 = findings (matches impeccable convention)
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const JSX_EXTS = new Set(['.tsx', '.jsx']);
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const fastMode = args.includes('--fast');
const targets = args.filter((a) => !a.startsWith('--'));

if (targets.length === 0) {
  process.stderr.write(
    'Usage: node scripts/impeccable-tsx.mjs [--json] [--fast] <file-or-dir...>\n',
  );
  process.exit(1);
}

// ─── camelCase JS key → CSS property name ────────────────────────────────────

const VENDOR_PREFIXES = { Webkit: '-webkit', Moz: '-moz', Ms: '-ms', O: '-o' };

function jsKeyToCss(key) {
  for (const [prefix, cssPrefix] of Object.entries(VENDOR_PREFIXES)) {
    if (key.startsWith(prefix) && key.length > prefix.length) {
      const after = key[prefix.length];
      if (after >= 'A' && after <= 'Z') {
        const rest = key.slice(prefix.length);
        return `${cssPrefix}-${camelToKebab(rest.charAt(0).toLowerCase() + rest.slice(1))}`;
      }
    }
  }
  return camelToKebab(key);
}

function camelToKebab(s) {
  return s.replace(/([A-Z])/g, (c) => `-${c.toLowerCase()}`);
}

// ─── JS value → CSS value ─────────────────────────────────────────────────────

function jsValueToCss(raw) {
  const val = raw.trim().replace(/,$/, '').trim();
  if (val.startsWith("'") || val.startsWith('"')) {
    // Single or double-quoted string: strip quotes
    const q = val[0];
    const end = val.lastIndexOf(q);
    return end > 0 ? val.slice(1, end) : val.slice(1);
  }
  if (val.startsWith('`')) {
    // Template literal: strip backticks, replace ${expr} with a CSS-safe placeholder
    const end = val.lastIndexOf('`');
    return val
      .slice(1, end > 0 ? end : undefined)
      .replace(/\$\{[^}]+\}/g, '#var');
  }
  return val;
}

// ─── JSX inline style extractor ──────────────────────────────────────────────

/**
 * Extracts `style={{...}}` blocks from JSX/TSX source.
 * Returns [{ props: [{cssKey, cssValue, lineOffset}], startLine }]
 * where startLine is 1-based.
 */
function extractJsxStyles(content) {
  const results = [];
  let pos = 0;

  while (pos < content.length) {
    const tagIdx = content.indexOf('style={{', pos);
    if (tagIdx === -1) break;

    const startLine = content.slice(0, tagIdx).split('\n').length;

    // Scan past the opening "{{" tracking brace depth (depth=1 = inside the object)
    let depth = 1;
    let i = tagIdx + 8; // character after "style={{"
    let inStr = null;
    let escaped = false;

    while (i < content.length && depth > 0) {
      const ch = content[i];
      if (escaped) {
        escaped = false;
        i++;
        continue;
      }
      if (inStr) {
        if (ch === '\\') escaped = true;
        else if (ch === inStr) inStr = null;
      } else {
        if (ch === '"' || ch === "'" || ch === '`') {
          inStr = ch;
        } else if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      i++;
    }

    const objContent = content.slice(tagIdx + 8, i);
    const props = parseObjectProps(objContent);
    if (props.length > 0) results.push({ props, startLine });

    pos = i + 2; // skip past "}}"
  }

  return results;
}

/**
 * Parses JS object literal content into [{cssKey, cssValue, lineOffset}].
 * lineOffset is the 0-based line index within the block.
 */
function parseObjectProps(content) {
  const props = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('//')) continue;

    // Match: [optional-quote]identifier[optional-quote]: value[,]
    const m = line.match(
      /^(?:['"]?)([a-zA-Z_$][a-zA-Z0-9_$]*)(?:['"]?)\s*:\s*(.+)$/,
    );
    if (!m) continue;

    const cssKey = jsKeyToCss(m[1]);
    const cssValue = jsValueToCss(m[2]);
    if (cssValue) props.push({ cssKey, cssValue, lineOffset: i });
  }

  return props;
}

// ─── Temp CSS builder ─────────────────────────────────────────────────────────

/**
 * Converts extracted JSX style blocks to a CSS string.
 * Returns { cssContent, lineMap } where lineMap[cssLine] = originalLine (both 1-based).
 */
function buildTempCss(styleBlocks) {
  const lines = [];
  const lineMap = {};

  for (const block of styleBlocks) {
    // Group all properties for this block into one rule so adjacency-based
    // multi-property patterns (e.g. gradient-text) are detected within the
    // same block context window.
    lines.push(`.jsx-inline-${block.startLine} {`);
    for (const prop of block.props) {
      const cssLineNum = lines.length + 1; // 1-based
      lineMap[cssLineNum] = block.startLine + prop.lineOffset;
      lines.push(`  ${prop.cssKey}: ${prop.cssValue};`);
    }
    lines.push('}');
    lines.push('');
  }

  return { cssContent: lines.join('\n'), lineMap };
}

// ─── impeccable runner ────────────────────────────────────────────────────────

function runImpeccable(fileArgs, extraFlags = '') {
  try {
    const cmd = `npx impeccable detect --json${extraFlags} ${fileArgs}`;
    const out = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Exit code 0: clean scan, output is on stdout
    return JSON.parse(out.trim() || '[]');
  } catch (e) {
    // Exit code 2: findings present. impeccable writes JSON to stderr in this case.
    // Try stderr first, fall back to stdout.
    const output = (e.stderr || '').trim() || (e.stdout || '').trim();
    if (output) {
      try {
        return JSON.parse(output);
      } catch {}
    }
    return [];
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const allFindings = [];
const fastFlag = fastMode ? ' --fast' : '';

for (const target of targets) {
  const absPath = resolve(target);
  const ext = extname(absPath).toLowerCase();

  if (!JSX_EXTS.has(ext)) {
    // Non-JSX/TSX: forward directly to impeccable
    allFindings.push(...runImpeccable(`"${absPath}"`, fastFlag));
    continue;
  }

  // Step 1: Run impeccable on the original file (handles Tailwind, CSS-in-JS literals, etc.)
  allFindings.push(...runImpeccable(`"${absPath}"`, fastFlag));

  // Step 2: Extract JSX inline styles
  let content;
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch {
    continue;
  }

  const styleBlocks = extractJsxStyles(content);
  if (styleBlocks.length === 0) continue;

  const { cssContent, lineMap } = buildTempCss(styleBlocks);
  if (!cssContent.trim()) continue;

  // Step 3: Write temp .css file and run impeccable on it.
  // .css files get block-context matching in impeccable, which is required for
  // multi-property patterns like gradient-text (background-clip + gradient on
  // adjacent lines).  Do NOT pass --fast here — block context needs full scan.
  const tmpFile = `${tmpdir()}/impeccable-tsx-${randomBytes(6).toString('hex')}.css`;
  try {
    writeFileSync(tmpFile, cssContent, 'utf-8');
    const cssFindings = runImpeccable(`"${tmpFile}"`);

    // Step 4: Remap findings from temp CSS back to original file + line
    for (const f of cssFindings) {
      allFindings.push({
        ...f,
        file: absPath,
        line: lineMap[f.line] ?? f.line,
        snippet: f.snippet,
      });
    }
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {}
  }
}

// Deduplicate: same pattern + same file + same approximate line
const seen = new Set();
const deduped = allFindings.filter((f) => {
  const key = `${f.antipattern}||${f.file}||${f.line ?? 0}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

if (jsonMode) {
  process.stdout.write(JSON.stringify(deduped, null, 2) + '\n');
} else if (deduped.length === 0) {
  process.stdout.write('No issues found.\n');
} else {
  const grouped = {};
  for (const f of deduped) {
    (grouped[f.file] ??= []).push(f);
  }
  for (const [file, items] of Object.entries(grouped)) {
    process.stdout.write(`\n${file}\n`);
    for (const item of items) {
      process.stdout.write(
        `  ${item.line ? `line ${item.line}: ` : ''}[${item.antipattern}] ${item.snippet}\n`,
      );
    }
  }
  process.stdout.write(
    `\n${deduped.length} anti-pattern${deduped.length === 1 ? '' : 's'} found.\n`,
  );
}

process.exit(deduped.length > 0 ? 2 : 0);
