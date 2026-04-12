import { readFile, readdir, access } from 'node:fs/promises';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { getRepoRoot, runPnpm } from '../run-command.js';
import type { ToolResult } from '../types.js';

const INSTALL_TIMEOUT = 300_000; // 5 minutes — installs can be slow with lock contention

interface InstallPackageParams {
  name: string;
  version?: string;
  dev?: boolean;
  worktreePath?: string;
}

/** Check if node_modules is a symlink. Works cross-platform. */
async function isSymlink(cwd: string): Promise<boolean> {
  try {
    const stat = await lstat(join(cwd, 'node_modules'));
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/** Check if a package bundles its own types (has `types` or `typings` field). */
async function hasBuiltinTypes(
  packageName: string,
  cwd: string,
): Promise<boolean> {
  try {
    const output = await runPnpm(
      ['info', packageName, 'types', 'typings', '--json'],
      cwd,
      15_000,
    );
    const parsed = JSON.parse(output);
    // pnpm info --json returns an object with the fields
    return Boolean(parsed.types || parsed.typings);
  } catch {
    // If pnpm info fails (e.g. package not in registry yet), assume no bundled types
    return false;
  }
}

/** Check if @types/ companion exists in the npm registry. */
async function typesCompanionExists(
  packageName: string,
  cwd: string,
): Promise<boolean> {
  // Scoped packages: @foo/bar -> @types/foo__bar
  const typesName = packageName.startsWith('@')
    ? `@types/${packageName.slice(1).replace('/', '__')}`
    : `@types/${packageName}`;

  try {
    await runPnpm(['info', typesName, 'version'], cwd, 15_000);
    return true;
  } catch {
    return false;
  }
}

/** Scan lib/ for nested node_modules that indicate version duplication (Node-based, cross-platform). */
async function findNestedNodeModules(cwd: string): Promise<string[]> {
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
    // lib/ may not exist
  }

  return nested;
}

export async function installPackage(
  params: InstallPackageParams,
): Promise<ToolResult> {
  const cwd = params.worktreePath || getRepoRoot();
  const spec = params.version
    ? `${params.name}@${params.version}`
    : params.name;

  // --- Safety: detect symlinked node_modules ---
  const linked = await isSymlink(cwd);
  if (linked) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: 'SYMLINK_DETECTED',
              message:
                'node_modules is a symlink to the main repo. Running pnpm install here would mutate the shared node_modules and break every other worktree. ' +
                'To install a package: (1) run the install in the main repo directory, or (2) remove the symlink first (cmd /c "rmdir node_modules") then run make install.',
              cwd,
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }

  // --- Install via pnpm add (cross-platform) ---
  // Symlink guard already ran above, so it's safe to call pnpm directly.
  const addArgs = ['add', '-w', ...(params.dev ? ['-D'] : []), spec];

  try {
    const output = await runPnpm(addArgs, cwd, INSTALL_TIMEOUT);

    // --- Post-install checks ---
    const warnings: string[] = [];

    // 1. Check for nested node_modules
    const nestedDirs = await findNestedNodeModules(cwd);
    if (nestedDirs.length > 0) {
      warnings.push(
        `Found nested node_modules (potential version duplication): ${nestedDirs.join(', ')}. ` +
          'Consider adding pnpm.overrides in root package.json to pin the version.',
      );
    }

    // 2. Check if @types/ companion is needed
    let typesStatus: string;
    if (params.name.startsWith('@types/')) {
      typesStatus = 'installed_directly';
    } else if (await hasBuiltinTypes(params.name, cwd)) {
      typesStatus = 'bundled';
    } else if (await typesCompanionExists(params.name, cwd)) {
      typesStatus = 'companion_available';
      warnings.push(
        `Package "${params.name}" does not bundle types. A @types/ companion exists in the registry. ` +
          'Consider installing it as a dev dependency for full type support.',
      );
    } else {
      typesStatus = 'none_available';
    }

    // 3. Read installed version from root package.json
    let installedVersion: string | undefined;
    try {
      const pkgJson = JSON.parse(
        await readFile(join(cwd, 'package.json'), 'utf-8'),
      );
      const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
      installedVersion = deps[params.name] as string | undefined;
    } catch {
      // Non-critical — version reporting is best-effort
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              package: params.name,
              installedVersion,
              dev: params.dev ?? false,
              typesStatus,
              ...(warnings.length > 0 && { warnings }),
              output,
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
              error: 'INSTALL_FAILED',
              package: params.name,
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
