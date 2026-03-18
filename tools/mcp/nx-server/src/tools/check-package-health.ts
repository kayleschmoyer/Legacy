import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { platform } from 'node:os';
import { getRepoRoot, runCommand, runPnpm } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface PackageHealthParams {
  worktreePath?: string;
}

interface HealthIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  details?: string;
}

/** Check if node_modules is a junction (Windows reparse point). Always false on non-Windows. */
async function isJunction(nmPath: string): Promise<boolean> {
  if (platform() !== 'win32') return false;
  try {
    const result = await runCommand(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `[bool]((Get-Item '${nmPath}' -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)`,
      ],
      join(nmPath, '..'),
      10_000,
    );
    return result.trim() === 'True';
  } catch {
    return false;
  }
}

/** Scan lib/ for nested node_modules directories (version duplication signal). */
async function scanNestedNodeModules(cwd: string): Promise<string[]> {
  const nested: string[] = [];
  const libPath = join(cwd, 'lib');

  try {
    const libDirs = await readdir(libPath, { withFileTypes: true });
    for (const entry of libDirs) {
      if (!entry.isDirectory()) continue;
      const nmDir = join(libPath, entry.name, 'node_modules');
      try {
        await access(nmDir);
        nested.push(`lib/${entry.name}/node_modules`);
      } catch {
        // No nested node_modules — good
      }
    }
  } catch {
    // lib/ may not exist in all environments
  }

  return nested;
}

/** Read root package.json dependencies and devDependencies. */
async function readRootDependencies(cwd: string): Promise<{
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  overrides: Record<string, string>;
}> {
  const content = await readFile(join(cwd, 'package.json'), 'utf-8');
  const pkg = JSON.parse(content);
  return {
    dependencies: pkg.dependencies ?? {},
    devDependencies: pkg.devDependencies ?? {},
    overrides: pkg.pnpm?.overrides ?? {},
  };
}

/** Read workspace package.json files under lib/ and return their dependency declarations. */
async function readLibPackageDeps(cwd: string): Promise<
  Array<{
    name: string;
    path: string;
    dependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
  }>
> {
  const results: Array<{
    name: string;
    path: string;
    dependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
  }> = [];
  const libPath = join(cwd, 'lib');

  try {
    const libDirs = await readdir(libPath, { withFileTypes: true });
    for (const entry of libDirs) {
      if (!entry.isDirectory()) continue;
      try {
        const pkgPath = join(libPath, entry.name, 'package.json');
        const content = await readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        const deps = pkg.dependencies ?? {};
        const peerDeps = pkg.peerDependencies ?? {};
        if (Object.keys(deps).length > 0 || Object.keys(peerDeps).length > 0) {
          results.push({
            name: pkg.name ?? entry.name,
            path: `lib/${entry.name}`,
            dependencies: deps,
            peerDependencies: peerDeps,
          });
        }
      } catch {
        // package.json may not exist or be invalid
      }
    }
  } catch {
    // lib/ may not exist
  }

  return results;
}

/** Check if production dependencies are missing @types/ companions. Capped to avoid excessive registry calls. */
const MAX_TYPES_PROBES = 20;

async function findMissingTypes(
  rootDeps: Record<string, string>,
  rootDevDeps: Record<string, string>,
  cwd: string,
): Promise<string[]> {
  const missing: string[] = [];
  // Common packages that don't need @types/ (they bundle types or are type-only)
  const skipPatterns = [
    /^@types\//,
    /^@legacy-sports\//,
    /^@tamagui\//,
    /^typescript$/,
    /^eslint/,
    /^prettier/,
    /^vite/,
    /^tsx$/,
    /^vitest/,
    /^jest/,
    /^react/,
    /^next/,
    /^graphql/,
    /^drizzle/,
    /^zod$/,
  ];

  let probeCount = 0;

  for (const pkgName of Object.keys(rootDeps)) {
    if (probeCount >= MAX_TYPES_PROBES) break;
    if (skipPatterns.some((p) => p.test(pkgName))) continue;

    // Check if @types/ companion is already installed
    const typesName = pkgName.startsWith('@')
      ? `@types/${pkgName.slice(1).replace('/', '__')}`
      : `@types/${pkgName}`;

    if (typesName in rootDevDeps || typesName in rootDeps) continue;

    // Check if the package bundles types
    try {
      probeCount++;
      const output = await runPnpm(
        ['info', pkgName, 'types', 'typings', '--json'],
        cwd,
        10_000,
      );
      const parsed = JSON.parse(output);
      if (!parsed.types && !parsed.typings) {
        // Check if @types/ exists in registry
        try {
          await runPnpm(['info', typesName, 'version'], cwd, 10_000);
          missing.push(pkgName);
        } catch {
          // No @types/ companion in registry — nothing to install
        }
      }
    } catch {
      // Can't check — skip
    }
  }

  return missing;
}

export async function checkPackageHealth(
  params: PackageHealthParams,
): Promise<ToolResult> {
  const cwd = params.worktreePath || getRepoRoot();
  const issues: HealthIssue[] = [];

  try {
    // 1. Check junction status
    const nmPath = join(cwd, 'node_modules');
    const junctioned = await isJunction(nmPath);
    if (junctioned) {
      issues.push({
        severity: 'info',
        category: 'junction',
        message:
          'node_modules is a junction to the main repo. Package installs must be done in the main repo, not here.',
      });
    }

    // 2. Scan for nested node_modules
    const nestedDirs = await scanNestedNodeModules(cwd);
    for (const dir of nestedDirs) {
      issues.push({
        severity: 'error',
        category: 'nested_node_modules',
        message: `Found nested ${dir} — this causes version duplication and potential runtime crashes.`,
        details:
          'Add pnpm.overrides in root package.json to pin the duplicated package version. ' +
          'Check which package resolved differently with: pnpm why <package> --filter <lib>',
      });
    }

    // 3. Read dependency declarations
    const root = await readRootDependencies(cwd);
    const libPkgs = await readLibPackageDeps(cwd);

    // 4. Check lib/ packages for version mismatches with root
    for (const lib of libPkgs) {
      const allLibDeps = {
        ...lib.dependencies,
        ...lib.peerDependencies,
      };

      for (const [depName, depRange] of Object.entries(allLibDeps)) {
        const rootVersion =
          root.dependencies[depName] ?? root.devDependencies[depName];

        if (!rootVersion) continue; // Lib declares a dep not in root — separate concern

        // Flag wildcard or overly broad ranges
        if (depRange === '*' || depRange === '>=0.0.0') {
          issues.push({
            severity: 'warning',
            category: 'wildcard_range',
            message: `${lib.path} declares "${depName}": "${depRange}" — wildcard ranges cause version duplication.`,
            details: `Root has ${depName}@${rootVersion}. Pin the lib's version to match or use a narrow range.`,
          });
        }

        // Check if pnpm.overrides covers this
        if (
          (depRange === '*' || depRange.startsWith('>=')) &&
          !(depName in root.overrides)
        ) {
          issues.push({
            severity: 'warning',
            category: 'missing_override',
            message: `${depName} has a broad range in ${lib.path} but no pnpm.overrides entry.`,
            details: `Add "pnpm": { "overrides": { "${depName}": "$${depName}" } } to root package.json.`,
          });
        }
      }
    }

    // 5. Check for missing @types/ companions (limited to avoid too many registry calls)
    const missingTypes = await findMissingTypes(
      root.dependencies,
      root.devDependencies,
      cwd,
    );
    for (const pkg of missingTypes) {
      const typesName = pkg.startsWith('@')
        ? `@types/${pkg.slice(1).replace('/', '__')}`
        : `@types/${pkg}`;
      issues.push({
        severity: 'info',
        category: 'missing_types',
        message: `"${pkg}" does not bundle types and ${typesName} is available but not installed.`,
        details: `Install with: pnpm add -w -D ${typesName}`,
      });
    }

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const infoCount = issues.filter((i) => i.severity === 'info').length;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              healthy: errorCount === 0 && warningCount === 0,
              summary: {
                errors: errorCount,
                warnings: warningCount,
                info: infoCount,
                junctioned,
                libPackagesWithDeps: libPkgs.length,
              },
              issues,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: 'HEALTH_CHECK_FAILED',
              message: error instanceof Error ? error.message : String(error),
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
}
