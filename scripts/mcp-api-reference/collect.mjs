/**
 * Builds the MCP API reference model: which servers exist, how each is reached,
 * and the full tool surface of each.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { extractToolsFromFile, fsReader } from './extract.mjs';

/**
 * One entry per server package under tools/mcp/.
 *
 * `transports` describes how the server is actually reached:
 *   stdio  — launched per session from .mcp.json (src/index.ts)
 *   hosted — Lambda behind API Gateway, bearer-authenticated (src/lambda.ts)
 * Servers with both share one tool surface unless their sources diverge.
 */
const SERVERS = [
  {
    dir: 'worktree-server',
    id: 'worktree',
    label: 'Worktree',
    summary:
      'Git worktree lifecycle, branch/commit/push plumbing, and repo-wide git queries for parallel ticket work.',
  },
  {
    dir: 'make-server',
    id: 'legacy-sports-make',
    label: 'Make',
    summary:
      'Whitelisted Makefile targets, the pre-commit (pc) pipeline and its chunks, PR validation, and Terraform state surgery.',
  },
  {
    dir: 'nx-server',
    id: 'legacy-sports-nx',
    label: 'Nx',
    summary:
      'Nx project graph, affected-target runs, per-chunk pc execution, lint/format/test runners, and package health checks.',
  },
  {
    dir: 'ci-server',
    id: 'legacy-sports-ci',
    label: 'CI',
    summary:
      'GitHub Actions run triage: list/view runs, fetch and search logs, rerun failed jobs, and read Playwright reports.',
  },
  {
    dir: 'github-server',
    id: 'legacy-sports-github',
    label: 'GitHub',
    summary:
      'Pull request and review lifecycle — PR dashboards, review threads, labels, and merge readiness.',
  },
  {
    dir: 'jira-server',
    id: 'legacy-sports-jira',
    label: 'Jira',
    summary:
      'Ticket CRUD with guardrails, sprint assignment, blocker resolution, and epic descendant trees.',
  },
  {
    dir: 'aws-server',
    id: 'legacy-sports-aws',
    label: 'AWS',
    summary:
      'CloudWatch logs, Lambda/EC2/API Gateway inspection, Secrets Manager, SSM, and SSO auth health.',
  },
  {
    dir: 'db-admin-server',
    id: 'legacy-sports-db-admin',
    label: 'Database',
    summary:
      'Read-only SQL and migration status/apply against the dev RDS over HTTPS — no SSM tunnel required.',
  },
  {
    dir: 'rollbar-server',
    id: 'legacy-sports-rollbar',
    label: 'Rollbar',
    summary:
      'Production error triage: list and inspect items and occurrences, and set item status.',
  },
  {
    dir: 'browser-server',
    id: 'legacy-sports-browser',
    label: 'Browser',
    summary:
      'Drive the local dev site: start/stop the dev server, log in, navigate, and capture screenshots.',
  },
  {
    dir: 'dev-process-server',
    id: 'legacy-sports-dev-process',
    label: 'Dev Process',
    summary:
      'RFCs, ADRs, postmortems, test plans, reproduction capture, and cross-session continuation checkpoints.',
  },
  {
    dir: 'android-server',
    id: 'legacy-sports-android',
    label: 'Android',
    summary:
      'Android device/emulator connectivity, app install/launch, adb-backed screenshots, filtered logcat, and Gradle builds. Local-only — no SDK in any cloud agent environment.',
  },
];

const TRANSPORT_SOURCES = [
  { file: 'src/index.ts', transport: 'stdio' },
  { file: 'src/lambda.ts', transport: 'hosted' },
];

function mergeTool(existing, incoming, transport) {
  const tool = incoming;
  const merged = existing ?? { ...tool, transports: [] };
  if (!merged.transports.includes(transport)) merged.transports.push(transport);
  // Prefer whichever source carries the richer description / schema.
  if ((tool.description?.length ?? 0) > (merged.description?.length ?? 0)) {
    merged.description = tool.description;
  }
  if (
    Object.keys(tool.inputs ?? {}).length >
    Object.keys(merged.inputs ?? {}).length
  ) {
    merged.inputs = tool.inputs;
  }
  return merged;
}

/**
 * A reader backed by `git show`/`git ls-tree` against `ref` instead of the
 * working tree, so a historical (or base-branch) measurement never needs a
 * worktree or checkout — see LS-10149. Results are cached per path since the
 * same file is frequently read once for extraction and once for an existence
 * check.
 */
function gitReader(repoRoot, ref) {
  const toGitPath = (path) => relative(repoRoot, path).split(sep).join('/');
  const cache = new Map();

  const readFile = (path) => {
    const gitPath = toGitPath(path);
    if (cache.has(gitPath)) return cache.get(gitPath);
    let content;
    try {
      content = execFileSync('git', ['show', `${ref}:${gitPath}`], {
        cwd: repoRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      content = undefined;
    }
    cache.set(gitPath, content);
    return content;
  };

  return {
    exists: (path) => readFile(path) !== undefined,
    readFile,
    listFiles(dir) {
      const gitPath = toGitPath(dir);
      try {
        // `git ls-tree --name-only <ref> <dir>/` prints each entry prefixed
        // with the full path passed in, not just its basename — unlike
        // fsReader's readdirSync, which returns bare filenames. Strip the
        // prefix so callers (extract.mjs's `join(dir, name)`) don't double it.
        return execFileSync(
          'git',
          ['ls-tree', '--name-only', ref, `${gitPath}/`],
          {
            cwd: repoRoot,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
          },
        )
          .split('\n')
          .filter(Boolean)
          .map((entry) => basename(entry));
      } catch {
        return [];
      }
    },
  };
}

/**
 * Build the tool-surface model. Pass `ref` (e.g. `origin/main`) to measure
 * that ref via git plumbing instead of the working tree — no worktree or
 * checkout required, since the model only ever reads the handful of source
 * files (see TRANSPORT_SOURCES) a tool definition can live in.
 */
export function collect(repoRoot, { ref } = {}) {
  const reader = ref ? gitReader(repoRoot, ref) : fsReader;
  const servers = [];

  for (const entry of SERVERS) {
    const packageDir = join(repoRoot, 'tools/mcp', entry.dir);
    const byName = new Map();
    const transports = [];
    let serverInfo;

    for (const { file, transport } of TRANSPORT_SOURCES) {
      const path = join(packageDir, file);
      if (!reader.exists(path)) continue;
      transports.push(transport);

      const result = extractToolsFromFile(path, reader);
      serverInfo ??= result.serverInfo;
      for (const tool of result.tools) {
        byName.set(
          tool.name,
          mergeTool(byName.get(tool.name), tool, transport),
        );
      }
    }

    const tools = [...byName.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    // `id` is how an agent addresses the server (the .mcp.json key / connector
    // name, which becomes the mcp__<id>__<tool> prefix). A server's internally
    // declared name occasionally differs — surface that rather than hiding it.
    const declaredName = serverInfo?.name;
    servers.push({
      ...entry,
      declaredName:
        declaredName && declaredName !== entry.id ? declaredName : undefined,
      version: serverInfo?.version ?? '1.0.0',
      packageDir: `tools/mcp/${entry.dir}`,
      transports,
      toolCount: tools.length,
      tools,
    });
  }

  return {
    generatedFrom: 'tools/mcp/*/src/{index,lambda}.ts',
    serverCount: servers.length,
    toolCount: servers.reduce((sum, s) => sum + s.toolCount, 0),
    servers,
  };
}

export function repoRootFrom(metaUrl) {
  const here = new URL('.', metaUrl).pathname;
  return join(here, '..', '..');
}

export function readRepoVersion(repoRoot) {
  try {
    return JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'))
      .version;
  } catch {
    return undefined;
  }
}
