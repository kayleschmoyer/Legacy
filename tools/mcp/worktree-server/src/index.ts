import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { execSync } from 'node:child_process';
import { existsSync, lstatSync, readlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Constants & state
// ---------------------------------------------------------------------------

/** Resolve the main repo root (works from both main repo and worktrees). */
function getMainRepoPath(): string {
  const gitCommonDir = execSync('git rev-parse --git-common-dir', {
    encoding: 'utf-8',
    timeout: 5_000,
  }).trim();
  // In the main repo this returns ".git"; in a worktree it returns the absolute
  // path to the main repo's .git directory.
  if (gitCommonDir === '.git') {
    return process.cwd();
  }
  return resolve(gitCommonDir, '..');
}

const MAIN_REPO = getMainRepoPath();

/** Session-scoped active worktree (set via worktree_set). */
let activeWorktree: string | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface WorktreeInfo {
  key: string;
  path: string;
  branch: string | null;
  hasJunctionedNodeModules: boolean;
  nodeModulesTarget: string | null;
}

function isJunction(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function getJunctionTarget(p: string): string | null {
  try {
    return readlinkSync(p);
  } catch {
    return null;
  }
}

/** Enumerate all git worktrees (excluding the main repo itself). */
function getWorktrees(): WorktreeInfo[] {
  const output = execSync('git worktree list --porcelain', {
    cwd: MAIN_REPO,
    encoding: 'utf-8',
    timeout: 10_000,
  });

  const worktrees: WorktreeInfo[] = [];
  const blocks = output.trim().split('\n\n');

  for (const block of blocks) {
    const lines = block.split('\n');
    let wtPath = '';
    let branch: string | null = null;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        wtPath = line.slice('worktree '.length);
      } else if (line.startsWith('branch refs/heads/')) {
        branch = line.slice('branch refs/heads/'.length);
      }
    }

    // Skip the main repo entry
    if (!wtPath || resolve(wtPath) === resolve(MAIN_REPO)) continue;

    // Extract Jira key from branch name (e.g. "LS-1136/mcp-worktree-server")
    const keyMatch = branch?.match(/^(LS-\d+)/);
    const key = keyMatch?.[1] ?? wtPath.split(/[\\/]/).pop() ?? wtPath;

    const nmPath = join(wtPath, 'node_modules');
    const junctioned = isJunction(nmPath);
    const target = junctioned ? getJunctionTarget(nmPath) : null;

    worktrees.push({
      key,
      path: wtPath,
      branch,
      hasJunctionedNodeModules: junctioned,
      nodeModulesTarget: target,
    });
  }

  return worktrees;
}

/** Look up a worktree by key (e.g. "LS-1134" or "1134"). */
function resolveWorktreePath(key: string): string | null {
  const worktrees = getWorktrees();
  const normalised = key.startsWith('LS-') ? key : `LS-${key}`;
  return worktrees.find((w) => w.key === normalised)?.path ?? null;
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'worktree-server', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: 'worktree_list',
      description:
        'List all active worktrees with junction status and branch info.',
      inputSchema: { type: 'object' as const, properties: {} },
    },
    {
      name: 'worktree_set',
      description: 'Set the active worktree for subsequent commands.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          key: {
            type: 'string',
            description: "Ticket key like 'LS-1134' or just '1134'",
          },
        },
        required: ['key'],
      },
    },
    {
      name: 'worktree_run',
      description:
        'Run a shell command in the active (or specified) worktree. ' +
        'Refuses to run in the main repo when worktrees are active unless overridden.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          worktree: {
            type: 'string',
            description:
              "Optional ticket key (e.g. 'LS-1134'). Uses active worktree if omitted.",
          },
          allowMainRepo: {
            type: 'boolean',
            description:
              'Override: allow running in the main repo even when worktrees exist.',
          },
        },
        required: ['command'],
      },
    },
    {
      name: 'worktree_guard',
      description:
        'Check whether a path is inside the main repo and warn if worktrees are active.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Path to check' },
        },
        required: ['path'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    // -----------------------------------------------------------------------
    // worktree_list
    // -----------------------------------------------------------------------
    case 'worktree_list': {
      const worktrees = getWorktrees();
      const activeLabel = activeWorktree
        ? `\nActive worktree: ${activeWorktree}`
        : '\nNo active worktree set.';

      if (worktrees.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No worktrees found.${activeLabel}`,
            },
          ],
        };
      }

      const lines = worktrees.map((w) => {
        const nmStatus = w.hasJunctionedNodeModules
          ? `node_modules: junctioned -> ${w.nodeModulesTarget}`
          : existsSync(join(w.path, 'node_modules'))
            ? 'node_modules: independent'
            : 'node_modules: missing';
        return [
          w.key,
          `  Path:   ${w.path}`,
          `  Branch: ${w.branch ?? 'unknown'}`,
          `  ${nmStatus}`,
        ].join('\n');
      });

      return {
        content: [{ type: 'text', text: lines.join('\n\n') + activeLabel }],
      };
    }

    // -----------------------------------------------------------------------
    // worktree_set
    // -----------------------------------------------------------------------
    case 'worktree_set': {
      const { key } = args as { key: string };
      const resolved = resolveWorktreePath(key);

      if (!resolved) {
        return {
          content: [
            {
              type: 'text',
              text: `No worktree found for key '${key}'. Run worktree_list to see available worktrees.`,
            },
          ],
          isError: true,
        };
      }

      activeWorktree = resolved;
      return {
        content: [
          { type: 'text', text: `Active worktree set to: ${resolved}` },
        ],
      };
    }

    // -----------------------------------------------------------------------
    // worktree_run
    // -----------------------------------------------------------------------
    case 'worktree_run': {
      const { command, worktree, allowMainRepo } = args as {
        command: string;
        worktree?: string;
        allowMainRepo?: boolean;
      };

      let targetDir: string;

      if (worktree) {
        const resolved = resolveWorktreePath(worktree);
        if (!resolved) {
          return {
            content: [
              {
                type: 'text',
                text: `No worktree found for key '${worktree}'.`,
              },
            ],
            isError: true,
          };
        }
        targetDir = resolved;
      } else if (activeWorktree) {
        targetDir = activeWorktree;
      } else {
        const wts = getWorktrees();
        if (wts.length > 0 && !allowMainRepo) {
          return {
            content: [
              {
                type: 'text',
                text:
                  `Refused: no active worktree set and ${wts.length} worktree(s) exist.\n` +
                  'Running commands in the main repo while worktrees are active is dangerous.\n' +
                  'Use worktree_set first, pass the worktree parameter, or set allowMainRepo=true.\n\n' +
                  `Available: ${wts.map((w) => w.key).join(', ')}`,
              },
            ],
            isError: true,
          };
        }
        targetDir = MAIN_REPO;
      }

      // Guard: refuse main-repo execution when worktrees exist
      if (resolve(targetDir) === resolve(MAIN_REPO) && !allowMainRepo) {
        const wts = getWorktrees();
        if (wts.length > 0) {
          return {
            content: [
              {
                type: 'text',
                text:
                  `Refused: cannot run in main repo (${MAIN_REPO}) while ` +
                  `${wts.length} worktree(s) are active. Set allowMainRepo=true to override.`,
              },
            ],
            isError: true,
          };
        }
      }

      if (!existsSync(targetDir)) {
        return {
          content: [
            { type: 'text', text: `Directory does not exist: ${targetDir}` },
          ],
          isError: true,
        };
      }

      try {
        const shell =
          process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
        const output = execSync(command, {
          cwd: targetDir,
          encoding: 'utf-8',
          timeout: 120_000,
          shell,
          maxBuffer: 10 * 1024 * 1024,
        });

        return {
          content: [
            {
              type: 'text',
              text: `[cwd: ${targetDir}]\n$ ${command}\n\n${output}`,
            },
          ],
        };
      } catch (err: unknown) {
        const e = err as {
          stdout?: string;
          stderr?: string;
          status?: number;
        };
        const output = [e.stdout, e.stderr].filter(Boolean).join('\n');
        return {
          content: [
            {
              type: 'text',
              text: `[cwd: ${targetDir}]\n$ ${command}\n\nExit code: ${e.status ?? 'unknown'}\n${output}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_guard
    // -----------------------------------------------------------------------
    case 'worktree_guard': {
      const { path: checkPath } = args as { path: string };
      const resolved = resolve(checkPath);
      const mainResolved = resolve(MAIN_REPO);
      const isMainRepo =
        resolved === mainResolved ||
        resolved.startsWith(mainResolved + '\\') ||
        resolved.startsWith(mainResolved + '/');
      const worktrees = getWorktrees();

      const result: {
        isMainRepo: boolean;
        activeWorktrees: string[];
        warning?: string;
      } = {
        isMainRepo,
        activeWorktrees: worktrees.map((w) => w.key),
      };

      if (isMainRepo && worktrees.length > 0) {
        result.warning =
          `Path is in the main repo (${MAIN_REPO}) and ${worktrees.length} ` +
          'worktree(s) are active. Running commands or editing files here ' +
          'instead of in a worktree is the #1 agent failure mode. ' +
          `Active worktrees: ${worktrees.map((w) => w.key).join(', ')}`;
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`MCP worktree-server fatal: ${String(err)}\n`);
  process.exit(1);
});
