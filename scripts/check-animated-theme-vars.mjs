#!/usr/bin/env node
// Animated-component CSS-variable guard (LS-8554, epic LS-8518).
//
// Fails when a Tamagui component carries BOTH an animation prop and a colour
// value written as a CSS custom property (`var(--token)`).
//
// Why: @tamagui/animations-react-native interpolates animated colour values
// through React Native's colour normalizer. RN cannot parse `var(--x)`, so it
// returns null and the driver then calls `.map` on it:
//
//     TypeError: Cannot read properties of null (reading 'map')
//         at _t.interpolate (tamagui-vendor)
//         at useAnimations  (tamagui-vendor)
//
// The component throws and the error boundary swallows the whole page. This is
// runtime-only — typecheck, lint, format and build all pass. It first bit on
// PR #6194 (LS-8528), where it took out 51 admin E2E tests.
//
// The fix is always the same: on an animated component use Tamagui token props
// instead of raw CSS vars —
//     backgroundColor="$surfaceCard"   not  style={{ background: 'var(--surfaceCard)' }}
//     hoverStyle={{ backgroundColor: '$color4' }}
// `var(--token)` stays perfectly fine on plain DOM elements and on Tamagui
// components that are NOT animated.
//
// This check is deliberately ELEMENT-scoped, not file-scoped: a `var(--token)`
// on a *child* of an animated component is harmless, and a file-level grep
// produces ~12 false positives across this repo.
//
// Usage:
//   node scripts/check-animated-theme-vars.mjs           # check
//   node scripts/check-animated-theme-vars.mjs --broad   # widen to every prop
//
// Make target: `make lint-animated-theme-vars`.
// CI: .github/checks/animated-theme-vars.sh runs this on every PR.

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Directories scanned. Mirrors the LS-8519 ratchet's project list. */
export const PROJECTS = [
  'apps/web/src',
  'apps/app',
  'lib/shared-components/src',
];

/** Props that mark a component as animated (Tamagui). */
export const ANIMATION_PROPS = new Set(['animation', 'animateOnly']);

/** Props whose values are folded into the animated style object. */
const STYLEISH =
  /^(style|hoverStyle|pressStyle|focusStyle|enterStyle|exitStyle)$/;

/** Direct colour props Tamagui animates. */
const COLORISH =
  /^(color|background|backgroundColor|borderColor|borderTopColor|borderBottomColor|borderLeftColor|borderRightColor|shadowColor|placeholderTextColor|fill|stroke)$/;

const IGNORED_DIRS = /^(node_modules|dist|build|coverage|\.nx|\.git)$/;

/** Collect string literals containing `var(--` beneath a node. */
function collectCssVars(node, prop, hits) {
  if (!node) return;
  if (
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    node.text.includes('var(--')
  ) {
    hits.push({ prop, value: node.text });
    return;
  }
  if (ts.isTemplateExpression(node)) {
    const text = node.getText();
    if (text.includes('var(--')) {
      hits.push({ prop, value: text.replace(/\s+/g, ' ').slice(0, 100) });
      return;
    }
  }
  node.forEachChild((child) => collectCssVars(child, prop, hits));
}

/**
 * Scan a single source file for animated elements carrying CSS-var colours.
 *
 * Exported so tests can pass source strings directly, without touching disk.
 *
 * @param {string} fileName  Label used in results (no I/O performed on it).
 * @param {string} source    TSX source text.
 * @param {{ broad?: boolean }} [options]  broad: inspect every prop, not just
 *   the style/colour allowlist. Guards against prop names we failed to list.
 * @returns {{ file: string, line: number, tag: string,
 *             hits: { prop: string, value: string }[] }[]}
 */
export function scanSource(fileName, source, options = {}) {
  const { broad = false } = options;
  const findings = [];
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const isAnimated = attrs.some(
        (a) => a.name && ANIMATION_PROPS.has(a.name.getText()),
      );
      if (isAnimated) {
        const hits = [];
        for (const attr of attrs) {
          if (!attr.name || !attr.initializer) continue;
          const prop = attr.name.getText();
          // The animation prop itself never holds a colour.
          if (ANIMATION_PROPS.has(prop)) continue;
          if (broad || STYLEISH.test(prop) || COLORISH.test(prop)) {
            collectCssVars(attr.initializer, prop, hits);
          }
        }
        if (hits.length > 0) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          findings.push({
            file: fileName,
            line: line + 1,
            tag: node.tagName.getText(),
            hits,
          });
        }
      }
    }
    node.forEachChild(visit);
  };

  visit(sf);
  return findings;
}

function walkTsx(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // Project dir absent in a partial checkout — not an error.
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.test(entry.name)) continue;
      walkTsx(full, out);
    } else if (entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** Scan the configured projects from disk. */
export function scanProjects(options = {}) {
  const findings = [];
  let filesScanned = 0;
  for (const project of PROJECTS) {
    const dir = join(root, project);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const file of walkTsx(dir)) {
      const source = readFileSync(file, 'utf8');
      filesScanned++;
      // Cheap pre-filter: no animation prop anywhere means nothing to find.
      if (!source.includes('animation')) continue;
      const rel = file.slice(root.length + 1).replace(/\\/g, '/');
      findings.push(...scanSource(rel, source, options));
    }
  }
  return { findings, filesScanned };
}

function main() {
  const broad = process.argv.includes('--broad');
  const { findings, filesScanned } = scanProjects({ broad });

  if (findings.length === 0) {
    console.log(
      `Animated-theme-var check passed (${filesScanned} .tsx files scanned).`,
    );
    return;
  }

  for (const { file, line, tag, hits } of findings) {
    console.error(`VIOLATION  ${file}:${line}  <${tag}>`);
    for (const { prop, value } of hits) {
      console.error(`             ${prop}: ${value}`);
    }
  }

  console.error(
    `\nAnimated-theme-var check failed: ${findings.length} animated ` +
      `component(s) use var(--token) colours.\n` +
      `Tamagui's react-native animation driver cannot parse a CSS custom ` +
      `property — it returns null and crashes the page at runtime (the build ` +
      `still passes).\n` +
      `Use Tamagui token props on animated components instead:\n` +
      `  backgroundColor="$surfaceCard"          not  style={{ background: 'var(--surfaceCard)' }}\n` +
      `  hoverStyle={{ backgroundColor: '$color4' }}\n` +
      `var(--token) remains fine on non-animated elements.\n` +
      `See .agents/skills/ui/SKILL.md (LS-8554, epic LS-8518).`,
  );
  process.exit(1);
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
