#!/usr/bin/env node
// Generate SVG files from Mermaid (.mmd) sources under .agents/skills/**/diagrams/.
// Source of truth: .mmd files. SVGs are build artifacts — never hand-edit.
//
// Run via: make diagrams  OR  node scripts/generate-diagrams.mjs
//
// Requires @mermaid-js/mermaid-cli (mmdc). Declared as a root devDependency; falls back to global install.

import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const skillsDir = join(root, '.agents', 'skills');

/**
 * Recursively find all .mmd files under a directory.
 */
function findMmdFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...findMmdFiles(full));
    } else if (st.isFile() && name.endsWith('.mmd')) {
      out.push(full);
    }
  }
  return out;
}

const mmdFiles = findMmdFiles(skillsDir);

if (mmdFiles.length === 0) {
  console.log('No .mmd files found under .agents/skills/');
  process.exit(0);
}

// Prefer local node_modules over a global PATH install.
// Run via Node directly to avoid Windows .CMD shell-exec issues.
const localMmdcJs = join(
  root,
  'node_modules',
  '@mermaid-js',
  'mermaid-cli',
  'src',
  'cli.js',
);

let mmdcCmd, mmdcBaseArgs;
if (existsSync(localMmdcJs)) {
  mmdcCmd = process.execPath;
  mmdcBaseArgs = [localMmdcJs];
} else {
  try {
    mmdcCmd = execFileSync(
      process.platform === 'win32' ? 'where' : 'which',
      ['mmdc'],
      { encoding: 'utf8' },
    )
      .split(/\r?\n/)[0]
      .trim();
    mmdcBaseArgs = [];
  } catch {
    console.error(
      'mmdc not found. Install with: pnpm add -D @mermaid-js/mermaid-cli',
    );
    process.exit(1);
  }
}

let generated = 0;
let failed = 0;

for (const mmd of mmdFiles) {
  const svg = mmd.replace(/\.mmd$/, '.svg');
  try {
    execFileSync(
      mmdcCmd,
      [...mmdcBaseArgs, '-i', mmd, '-o', svg, '-b', 'transparent'],
      {
        stdio: 'pipe',
      },
    );
    generated++;
    console.log(`  generated  ${svg.replace(root + '/', '')}`);
  } catch (err) {
    failed++;
    console.error(`  failed     ${mmd.replace(root + '/', '')}`);
    console.error(
      `             ${(err.stderr ?? err.message).toString().trim()}`,
    );
  }
}

console.log(`\n${generated} generated, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
