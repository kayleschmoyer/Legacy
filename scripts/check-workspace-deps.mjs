#!/usr/bin/env node
/**
 * Undeclared workspace dependency check (LS-8622).
 *
 * For every workspace package under apps/ and lib/, verifies that each
 * `@legacy-sports/*` import specifier appearing in the package's source is
 * declared in that package's package.json (dependencies, devDependencies,
 * peerDependencies, or optionalDependencies).
 *
 * Why: TypeScript resolves workspace imports via tsconfig paths, so an
 * undeclared dependency keeps every PR gate green — but Metro (the React
 * Native bundler) resolves via node_modules and fails post-merge. LS-8617
 * (PR #6094) shipped exactly this: apps/app imported
 * @legacy-sports/design-tokens without declaring it, and main's Android
 * build was red for ~3 days.
 *
 * Deliberately simple: ANY @legacy-sports/* specifier in a package's source
 * requires a manifest entry — no distinction for type-only imports. The one
 * carve-out: specifiers naming a tsconfig-paths-only Nx library (a lib with
 * no package.json of its own, e.g. @legacy-sports/scheduling) are skipped,
 * because no manifest entry can exist for a package that is not a pnpm
 * workspace package.
 *
 * Usage:
 *   node scripts/check-workspace-deps.mjs           # human output
 *   node scripts/check-workspace-deps.mjs --json    # JSON output for agents
 *
 * Exit code 0 if no violations, 1 if violations found.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/** Workspace roots the check sweeps (per LS-8622 scope). */
export const PACKAGE_ROOTS = ['apps', 'lib'];

/** Workspace scope whose imports must be declared. */
export const WORKSPACE_SCOPE = '@legacy-sports';

/** File extensions scanned for import specifiers. */
const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

/** Directory names never descended into (build output, native shells, deps). */
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'out',
  'android',
  'ios',
  '.expo',
  '.next',
  '.turbo',
  '.tamagui',
]);

/**
 * Matches the specifier of every import form that a bundler must resolve:
 * static import/export-from, side-effect import, dynamic import(), require(),
 * require.resolve(), and jest module hooks (mock/requireActual/requireMock).
 */
const SPECIFIER_RE =
  /(?:\bfrom\s*|\bimport\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\brequire\.resolve\s*\(\s*|\bjest\.(?:mock|requireActual|requireMock)\s*\(\s*)['"](@legacy-sports\/[^'"]+)['"]/g;

/** Extract all @legacy-sports/* specifiers from one source text. */
export function extractSpecifiers(source) {
  const specifiers = [];
  let lineNum = 0;
  for (const line of source.split('\n')) {
    lineNum++;
    for (const match of line.matchAll(SPECIFIER_RE)) {
      specifiers.push({
        specifier: match[1],
        line: lineNum,
        text: line.trim(),
      });
    }
  }
  return specifiers;
}

/** Reduce a specifier (possibly a deep import) to its package name. */
export function packageNameOf(specifier) {
  const [scope, name] = specifier.split('/');
  return name ? `${scope}/${name}` : specifier;
}

function walkSourceFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) walkSourceFiles(full, files);
    } else if (SOURCE_EXTENSIONS.has(full.slice(full.lastIndexOf('.')))) {
      files.push(full);
    }
  }
  return files;
}

/** All declared dependency names across every dependency block. */
export function declaredDependencies(manifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
}

/**
 * Names of all pnpm workspace packages (any package.json under the
 * pnpm-workspace.yaml globs). Specifiers outside this set belong to
 * tsconfig-paths-only Nx libraries and cannot be declared.
 */
export function workspacePackageNames(root = repoRoot) {
  const names = new Set();
  for (const rootName of ['apps', 'lib', 'lambdas', 'tools']) {
    const base = join(root, rootName);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(base, entry.name, 'package.json');
      if (!existsSync(manifestPath)) continue;
      try {
        const { name } = JSON.parse(readFileSync(manifestPath, 'utf8'));
        if (name) names.add(name);
      } catch {
        // unparseable manifest — lockfile-check owns that failure
      }
    }
  }
  return names;
}

/**
 * Check a single package directory. Returns violations:
 * { package, packageDir, file, line, specifier, dependency, text }
 */
export function checkPackage(packageDir, workspaceNames, root = repoRoot) {
  const manifestPath = join(packageDir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const declared = declaredDependencies(manifest);
  const violations = [];

  for (const file of walkSourceFiles(packageDir)) {
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const { specifier, line, text } of extractSpecifiers(source)) {
      const dependency = packageNameOf(specifier);
      if (dependency === manifest.name) continue; // self-import
      if (!workspaceNames.has(dependency)) continue; // tsconfig-paths-only Nx lib
      if (!declared.has(dependency)) {
        violations.push({
          package: manifest.name,
          packageDir: relative(root, packageDir).split(sep).join('/'),
          file: relative(root, file).split(sep).join('/'),
          line,
          specifier,
          dependency,
          text,
        });
      }
    }
  }
  return violations;
}

/** Enumerate workspace package dirs (direct children of roots with a package.json). */
export function findPackageDirs(root = repoRoot, roots = PACKAGE_ROOTS) {
  const dirs = [];
  for (const rootName of roots) {
    const base = join(root, rootName);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(base, entry.name);
      if (existsSync(join(dir, 'package.json'))) dirs.push(dir);
    }
  }
  return dirs;
}

function main() {
  const jsonMode = process.argv.includes('--json');
  const packageDirs = findPackageDirs();
  const workspaceNames = workspacePackageNames();
  const violations = packageDirs.flatMap((dir) =>
    checkPackage(dir, workspaceNames),
  );

  if (jsonMode) {
    console.log(
      JSON.stringify({ violations, packageCount: packageDirs.length }, null, 2),
    );
  } else if (violations.length === 0) {
    console.log(
      `✓ All ${WORKSPACE_SCOPE}/* imports declared (${packageDirs.length} packages checked)`,
    );
  } else {
    console.log(`Found ${violations.length} undeclared workspace import(s):\n`);
    for (const v of violations) {
      console.log(`❌ ${v.file}:${v.line}`);
      console.log(`   ${v.package} imports ${v.specifier}`);
      console.log(
        `   → add "${v.dependency}": "workspace:*" to ${v.packageDir}/package.json\n`,
      );
    }
    console.log(
      'TypeScript resolves these via tsconfig paths so PR gates stay green, but',
    );
    console.log(
      'Metro resolves via node_modules and fails post-merge (LS-8617). Declare',
    );
    console.log(
      'the dependency and run `pnpm install` to update the lockfile.',
    );
  }

  process.exit(violations.length > 0 ? 1 : 0);
}

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
