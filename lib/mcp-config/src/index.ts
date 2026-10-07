import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * Repo-identity configuration for the agent harness (LS-10950 / LS-10951).
 *
 * Every value the MCP servers, hooks and scripts used to hardcode about
 * *this* repository — Jira project key, Atlassian site, deploys repo, AWS
 * resource naming, dotfile directory, MCP server-name prefix — lives in one
 * `harness.config.json` at the repository root so the same tooling can be
 * installed into another project with a different file.
 *
 * Resolution order (first hit wins, then env overrides are applied on top):
 *   1. `configPath` option
 *   2. `HARNESS_CONFIG_PATH` env var
 *   3. nearest `harness.config.json` walking up from `cwd`
 *   4. {@link DEFAULT_HARNESS_CONFIG}
 *
 * The defaults equal legacy-sports' own values so hosted Lambdas (no repo
 * on disk) behave exactly as before this library existed. LS-10952 wires
 * the Lambdas' Terraform to pass `HARNESS_*` env vars so the defaults can
 * eventually be removed.
 */

export const HARNESS_CONFIG_FILENAME = 'harness.config.json';

const nonEmpty = z.string().trim().min(1);

/** `OWNER/REPO` as GitHub prints it — no scheme, no `.git` suffix. */
const repoSlug = z
  .string()
  .regex(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
    'expected a GitHub "owner/repo" slug',
  );

/** Jira project keys are upper-case alphanumerics starting with a letter. */
const jiraProjectKey = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/, 'expected an upper-case Jira project key');

export const HarnessConfigSchema = z.object({
  /** Human-readable project name (used in generated docs and log prefixes). */
  name: nonEmpty,
  /**
   * Prefix of the stdio/hosted MCP server names as they appear in
   * `.mcp.json` and in tool names (`mcp__<prefix>-<suffix>__<tool>`).
   */
  mcpServerPrefix: nonEmpty,
  jira: z.object({
    projectKey: jiraProjectKey,
    siteUrl: z.string().url(),
  }),
  github: z.object({
    /** Repo that receives Playwright reports and preview deploys. */
    deploysRepo: repoSlug,
    /** GitHub Pages base URL for that repo (no trailing slash). */
    deploysPagesBaseUrl: z.string().url(),
  }),
  aws: z.object({
    /** `<resourcePrefix>-<env>-<short>` names Lambdas, log groups, VPC tags… */
    resourcePrefix: nonEmpty,
    ciArtifactsBucket: nonEmpty,
  }),
  /** Per-user cache directory under `$HOME` (e.g. the cached e2e JWT). */
  dotfileDir: nonEmpty,
});

export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = Object.freeze({
  name: 'legacy-sports',
  mcpServerPrefix: 'legacy-sports',
  jira: Object.freeze({
    projectKey: 'LS',
    siteUrl: 'https://bkrupa.atlassian.net',
  }),
  github: Object.freeze({
    deploysRepo: 'bkrupa/legacy-sports-deploys',
    deploysPagesBaseUrl: 'https://bkrupa.github.io/legacy-sports-deploys',
  }),
  aws: Object.freeze({
    resourcePrefix: 'legacy-sports',
    ciArtifactsBucket: 'legacy-sports-dev-ci-artifacts',
  }),
  dotfileDir: '.legacy-sports',
});

/**
 * Env var → config path. Every leaf is overridable so a hosted Lambda or a
 * CI job can point the tooling at another project without a file on disk.
 */
export const HARNESS_ENV_OVERRIDES = Object.freeze({
  HARNESS_NAME: ['name'],
  HARNESS_MCP_SERVER_PREFIX: ['mcpServerPrefix'],
  HARNESS_JIRA_PROJECT_KEY: ['jira', 'projectKey'],
  HARNESS_JIRA_SITE_URL: ['jira', 'siteUrl'],
  HARNESS_GITHUB_DEPLOYS_REPO: ['github', 'deploysRepo'],
  HARNESS_GITHUB_DEPLOYS_PAGES_BASE_URL: ['github', 'deploysPagesBaseUrl'],
  HARNESS_AWS_RESOURCE_PREFIX: ['aws', 'resourcePrefix'],
  HARNESS_AWS_CI_ARTIFACTS_BUCKET: ['aws', 'ciArtifactsBucket'],
  HARNESS_DOTFILE_DIR: ['dotfileDir'],
} as const satisfies Record<string, readonly string[]>);

export type HarnessEnvVar = keyof typeof HARNESS_ENV_OVERRIDES;

export interface LoadHarnessConfigOptions {
  /** Explicit file to load; skips discovery. Relative paths resolve from `cwd`. */
  configPath?: string;
  /** Directory to start the upward search from. Default `process.cwd()`. */
  cwd?: string;
  /** Environment to read `HARNESS_*` overrides from. Default `process.env`. */
  env?: NodeJS.ProcessEnv;
}

export interface LoadedHarnessConfig {
  config: HarnessConfig;
  /** Absolute path of the file that was read, or `null` when defaults were used. */
  source: string | null;
  /** Env vars that overrode a value from the file/defaults. */
  overrides: HarnessEnvVar[];
}

export class HarnessConfigError extends Error {
  constructor(
    message: string,
    readonly path: string | null,
  ) {
    super(message);
    this.name = 'HarnessConfigError';
  }
}

/**
 * Walk up from `startDir` to the filesystem root looking for
 * `harness.config.json`. Returns the absolute path or `null`.
 */
export function findHarnessConfigPath(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, HARNESS_CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readConfigFile(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    throw new HarnessConfigError(
      `Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`,
      path,
    );
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new HarnessConfigError(
      `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      path,
    );
  }
}

function setPath(
  target: Record<string, unknown>,
  path: readonly string[],
  value: string,
): void {
  let cursor: Record<string, unknown> = target;
  for (const segment of path.slice(0, -1)) {
    const next = cursor[segment];
    if (typeof next !== 'object' || next === null) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

/**
 * Load, merge and validate the harness configuration. Throws
 * {@link HarnessConfigError} on an unreadable/invalid file or an invalid env
 * override — never silently falls back once a file was found, because a
 * half-applied config would send tickets to the wrong Jira project or logs
 * to the wrong account.
 */
export function loadHarnessConfig(
  options: LoadHarnessConfigOptions = {},
): LoadedHarnessConfig {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;

  const explicit = options.configPath ?? env['HARNESS_CONFIG_PATH'];
  let source: string | null;
  if (explicit !== undefined && explicit !== '') {
    source = isAbsolute(explicit) ? explicit : resolve(cwd, explicit);
    if (!existsSync(source)) {
      throw new HarnessConfigError(
        `Harness config not found at ${source} (from ${options.configPath !== undefined ? 'configPath' : 'HARNESS_CONFIG_PATH'})`,
        source,
      );
    }
  } else {
    source = findHarnessConfigPath(cwd);
  }

  const base: unknown =
    source === null
      ? structuredClone(DEFAULT_HARNESS_CONFIG)
      : readConfigFile(source);

  if (typeof base !== 'object' || base === null || Array.isArray(base)) {
    throw new HarnessConfigError(
      `${source ?? HARNESS_CONFIG_FILENAME} must contain a JSON object`,
      source,
    );
  }

  const merged = base as Record<string, unknown>;
  const overrides: HarnessEnvVar[] = [];
  for (const [envVar, path] of Object.entries(HARNESS_ENV_OVERRIDES) as [
    HarnessEnvVar,
    readonly string[],
  ][]) {
    const value = env[envVar];
    if (value !== undefined && value !== '') {
      setPath(merged, path, value);
      overrides.push(envVar);
    }
  }

  const parsed = HarnessConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const where = source ?? 'built-in defaults';
    const via =
      overrides.length > 0 ? ` (env overrides: ${overrides.join(', ')})` : '';
    throw new HarnessConfigError(
      `Invalid harness config from ${where}${via}:\n${formatIssues(parsed.error)}`,
      source,
    );
  }

  return { config: parsed.data, source, overrides };
}

let cached: LoadedHarnessConfig | null = null;

/**
 * Process-wide cached accessor for long-lived MCP servers. The first call
 * resolves against `process.cwd()` / `process.env`; later calls return the
 * same object. Use {@link resetHarnessConfigCache} in tests.
 */
export function getHarnessConfig(): HarnessConfig {
  cached ??= loadHarnessConfig();
  return cached.config;
}

export function resetHarnessConfigCache(): void {
  cached = null;
}

// ---------------------------------------------------------------------------
// Helpers for the naming conventions that used to be string-literal'd.
// ---------------------------------------------------------------------------

/**
 * Regex matching a ticket key of this project's Jira (`LS-1234`), anchored
 * on word boundaries. The key is captured in group 1.
 */
export function ticketKeyPattern(
  config: Pick<HarnessConfig, 'jira'>,
  flags = '',
): RegExp {
  return new RegExp(`\\b(${config.jira.projectKey}-\\d+)\\b`, flags);
}

/** `https://<site>/browse/<KEY>` */
export function ticketUrl(
  config: Pick<HarnessConfig, 'jira'>,
  ticketKey: string,
): string {
  return `${config.jira.siteUrl.replace(/\/+$/, '')}/browse/${ticketKey}`;
}

/** `<resourcePrefix>-<environment>-<shortName>`, e.g. `legacy-sports-dev-graphql`. */
export function awsResourceName(
  config: Pick<HarnessConfig, 'aws'>,
  environment: string,
  shortName: string,
): string {
  return `${config.aws.resourcePrefix}-${environment}-${shortName}`;
}

/** `/<resourcePrefix>/<environment>/<name>` — the SSM parameter convention. */
export function awsSsmPath(
  config: Pick<HarnessConfig, 'aws'>,
  environment: string,
  name: string,
): string {
  return `/${config.aws.resourcePrefix}/${environment}/${name.replace(/^\/+/, '')}`;
}

/** `<mcpServerPrefix>-<suffix>`, e.g. `legacy-sports-nx`. */
export function mcpServerName(
  config: Pick<HarnessConfig, 'mcpServerPrefix'>,
  suffix: string,
): string {
  return `${config.mcpServerPrefix}-${suffix}`;
}

/**
 * Regex matching the fully qualified tool names of one MCP server
 * (`mcp__<prefix>-<suffix>__…`). Used by the Bash-vs-MCP audit.
 */
export function mcpToolNamePattern(
  config: Pick<HarnessConfig, 'mcpServerPrefix'>,
  suffix: string,
): RegExp {
  return new RegExp(`^mcp__${escapeRegExp(mcpServerName(config, suffix))}__`);
}

/** `<deploysPagesBaseUrl>/<path>` with exactly one slash between. */
export function deploysPagesUrl(
  config: Pick<HarnessConfig, 'github'>,
  path: string,
): string {
  return `${config.github.deploysPagesBaseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
