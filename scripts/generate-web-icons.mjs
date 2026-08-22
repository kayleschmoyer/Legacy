#!/usr/bin/env node
/**
 * Web icon generation from the canonical brand mark (LS-9539).
 *
 * Regenerates every icon under apps/web/public/ from ONE master —
 * apps/web/brand/logo-master.png — so the marks can never drift apart again.
 *
 * Background: apps/web/public shipped two visually different brand marks at the
 * same time. logo.png / logo-512.png carried the 3D-shaded medallion; logo-192.png
 * / apple-touch-icon.png carried a flat, heavier-stitched variant (pairwise RMSE
 * ~107 at 192x192 — different artwork, not a downscale). Users installing the PWA
 * saw one mark on the home screen and a different one once the app opened, and web
 * push notifications used the home-screen variant. LS-9539 picked the in-app mark
 * as canonical and made every icon a derivative of it.
 *
 * Framing is a deliberate per-context choice, not an accident of the source file:
 *
 *   padded (in-page)   the master's own ~10% transparent margin is preserved.
 *                      These marks sit inline next to text and need optical
 *                      breathing room, and transparency lets them sit on any
 *                      page background.
 *
 *   bleed (platform)   the transparent margin is trimmed so the medallion fills
 *                      the frame. Home-screen and notification icons are already
 *                      rendered inside a platform-drawn container (iOS rounded
 *                      rect, Android circular mask), so an extra in-asset margin
 *                      only shrinks the mark inside that container.
 *
 * apple-touch-icon.png is additionally flattened onto the brand page background:
 * iOS ignores the alpha channel and composites onto black, so a transparent
 * medallion renders with black corners on the home screen.
 *
 * Usage:
 *   node scripts/generate-web-icons.mjs           # write the icons
 *   node scripts/generate-web-icons.mjs --check   # verify on-disk icons match (read-only)
 *
 * Exit code 0 if all icons match (--check) or were written, 1 otherwise.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/**
 * sharp is not a declared workspace dependency — it is present transitively and this
 * script is a hand-run maintenance tool, not part of the build or CI. Declaring it at
 * the root re-resolves the lockfile (semver 7.7.4 -> 7.8.5 across 8 entries), which does
 * not belong in an asset change. Tracked separately in LS-9553.
 */
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error(
    'sharp is required to regenerate the web icons but could not be resolved.\n' +
      'Run `node scripts/modules-pool/link.mjs` (worktree) or `pnpm install` first.',
  );
  process.exit(1);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = resolve(ROOT, 'apps/web/brand/logo-master.png');
const PUBLIC = resolve(ROOT, 'apps/web/public');

/** Brand page background (docs/design/brand.md) — used where alpha is unsupported. */
const BRAND_BACKGROUND = '#0A0F1A';

/**
 * PNG encoder settings, uniform across all four icons. `effort: 10` lets sharp search
 * palette encodings and keep whichever is smaller, which is what holds `logo.png` at the
 * 28,215 B LS-9529 measured — a page load fetches only that plus `favicon.ico`, well under
 * the <100 KB budget. Do not force `palette: true` with `colors` <= 128 to shrink the rest:
 * it cuts `logo-512.png` to 32,883 B but shifts the brand seam red `#C41E3A` to brown and
 * posterizes the ball (RMSE 2.25 -> 9.33 against the full-colour render).
 */
const PNG_OPTIONS = { compressionLevel: 9, effort: 10 };

/** Each icon's consumers are documented in apps/web/brand/README.md. */
const ICONS = [
  {
    file: 'logo.png',
    size: 256,
    framing: 'padded',
  },
  {
    file: 'logo-512.png',
    size: 512,
    framing: 'padded',
  },
  {
    file: 'logo-192.png',
    size: 192,
    framing: 'bleed',
  },
  {
    file: 'apple-touch-icon.png',
    size: 180,
    framing: 'bleed',
    opaque: true,
  },
];

/** Render one icon from the master. Pure: same master in, same bytes out. */
async function render({ size, framing, opaque }) {
  const source =
    framing === 'bleed'
      ? await sharp(MASTER).trim({ threshold: 1 }).png().toBuffer()
      : readFileSync(MASTER);

  let pipeline = sharp(source).resize(size, size, {
    kernel: 'lanczos3',
    // 'contain' on a bleed icon: the trimmed medallion is 820x810, so contain
    // fills the frame on its long axis without distorting or cropping the ring.
    fit: framing === 'bleed' ? 'contain' : 'cover',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  if (opaque) pipeline = pipeline.flatten({ background: BRAND_BACKGROUND });

  return pipeline.png(PNG_OPTIONS).toBuffer();
}

async function main() {
  const check = process.argv.includes('--check');
  let failed = 0;
  let total = 0;

  for (const icon of ICONS) {
    const target = resolve(PUBLIC, icon.file);
    const buffer = await render(icon);
    total += buffer.length;

    if (check) {
      if (!existsSync(target)) {
        failed++;
        console.log(
          `MISSING ${icon.file.padEnd(21)} ${icon.size}px ${icon.framing}`,
        );
        continue;
      }
      const current = readFileSync(target);
      const matches = current.equals(buffer);
      if (!matches) failed++;
      console.log(
        `${matches ? 'ok  ' : 'DRIFT'} ${icon.file.padEnd(21)} ${icon.size}px ${icon.framing.padEnd(6)} ${current.length} B`,
      );
    } else {
      const before = existsSync(target) ? statSync(target).size : 0;
      writeFileSync(target, buffer);
      console.log(
        `wrote ${icon.file.padEnd(21)} ${icon.size}px ${icon.framing.padEnd(6)} ${before} B -> ${buffer.length} B`,
      );
    }
  }

  console.log(`\ngenerated icon payload: ${total} B`);

  if (failed > 0) {
    console.error(
      `\n${failed} icon(s) missing or out of sync with the master. Run: node scripts/generate-web-icons.mjs`,
    );
    process.exitCode = 1;
  }
}

await main();
