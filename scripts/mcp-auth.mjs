#!/usr/bin/env node
/**
 * scripts/mcp-auth.mjs
 *
 * Headless provisioning of the **Cognito machine credential** for the three
 * hosted MCP servers (legacy-sports-{github,jira,ci}). This is the local
 * developer side of "Track A — local minting + server-side validation" from
 * docs/rfcs/draft-seamless-mcp-auth.md (RFC AC-X2 / GAP-5, Phase 2 cutover).
 *
 * What it does:
 *   Reads the machine `client_credentials` identifiers Terraform published
 *   (LS-5090) and writes them to .env.local so the `headersHelper`
 *   (scripts/mcp-mint-token.mjs, LS-5092) can mint short-lived per-connect
 *   bearer tokens. There is NO interactive browser flow, NO localhost redirect,
 *   and NO per-session expiring `MCP_AUTH_TOKEN` — the durable machine secret
 *   stays on the machine and only short-lived minted tokens ever transit the
 *   wire (RFC F1/F2/AC-A4).
 *
 *   The legacy interactive Cognito authorization-code + PKCE flow that minted an
 *   8h ID token (`MCP_AUTH_TOKEN`) was removed in this cutover. The public
 *   `mcp_cli` client still exists for interactive use (e.g. Claude Code web
 *   OAuth, Track B), but local Claude Code no longer drives it.
 *
 * Prerequisites:
 *   `terraform apply` in terraform/main has created the Cognito machine grant
 *   (resource server + confidential `client_credentials` app client) and
 *   published its identifiers (LS-5090):
 *     - SSM  /legacy-sports-<env>/mcp/cognito/machine-client-id   (client id)
 *     - SSM  /legacy-sports-<env>/mcp/cognito/domain              (token endpoint base)
 *     - SSM  /legacy-sports-<env>/mcp/<name>/api-url              (3 API Gateway URLs)
 *     - Secrets Manager  <env>/mcp-machine-client-secret          (long-lived secret)
 *   You need AWS credentials with `ssm:GetParameter` and
 *   `secretsmanager:GetSecretValue` for those resources.
 *
 * Usage:
 *   node scripts/mcp-auth.mjs              # provision / refresh the machine credential
 *   node scripts/mcp-auth.mjs --machine    # explicit synonym for the default action
 *   node scripts/mcp-auth.mjs --force      # re-pull even if .env.local already has the creds
 *   node scripts/mcp-auth.mjs --env <env>  # target a non-default Terraform environment
 *   node scripts/mcp-auth.mjs --profile <p># use a specific AWS CLI profile
 *
 * Writes to .env.local:
 *   MCP_MACHINE_CLIENT_ID      — Cognito confidential (machine) client id (from SSM)
 *   MCP_MACHINE_CLIENT_SECRET  — long-lived machine secret (from Secrets Manager)
 *   MCP_AUTH_COGNITO_DOMAIN    — Cognito hosted-UI domain / token endpoint base (from SSM)
 *   MCP_JIRA_URL               — API Gateway invoke URL for legacy-sports-jira
 *   MCP_GITHUB_URL             — API Gateway invoke URL for legacy-sports-github
 *   MCP_CI_URL                 — API Gateway invoke URL for legacy-sports-ci
 *
 * Also mirrors the same MCP_* vars into Claude Code settings#/env at two paths
 * so `${MCP_*}` substitution in .mcp.json resolves — and so the headersHelper
 * can read the machine credential — for sessions that don't source .env.local
 * (Claude Desktop launches; worktree sessions without a project-local
 * settings.local.json):
 *   ~/.claude/settings.json                — user-scope; covers every session
 *                                            on this machine including worktrees
 *                                            (LS-4593).
 *   <repo>/.claude/settings.local.json     — project-local; transitional safety
 *                                            net for Claude Desktop (LS-4592).
 *
 * Also mirrors the three HTTP-transport MCP server definitions
 * (legacy-sports-github/jira/ci) into ~/.claude.json#/mcpServers (user-scope,
 * top-level). Claude Code 2.1.100 silently drops HTTP entries from project
 * .mcp.json and from ~/.claude.json#/projects.<path>.mcpServers; the top-level
 * user-scope block is the only working surface as of that release (LS-4595).
 * Each mirrored definition declares the same `headersHelper` as project
 * .mcp.json — it carries NO static credential.
 *
 * Why Cognito (and not IAM Identity Center direct)?
 *   See terraform/main/lambda-mcp-api-gateway.tf header comment. Short version:
 *   IC's idToken `aud` claim is AWS-internal, so API Gateway's JWT authorizer
 *   always rejected it. Cognito issues a proper OIDC token / scoped access
 *   token with a controllable aud.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_LOCAL_PATH = path.join(REPO_ROOT, '.env.local');
const CLAUDE_SETTINGS_PATH = path.join(
  REPO_ROOT,
  '.claude',
  'settings.local.json',
);
// User-scope Claude Code settings — merged into every Claude Code session
// regardless of project root, so worktree sessions (which have their own
// .claude/ directory with no settings.local.json) still see the MCP_* vars
// here. LS-4593: writing only to the project-local mirror above is not
// enough — Claude Code reads project settings from the project root only
// (no upward walk), so a worktree session never sees the main repo's
// .claude/settings.local.json. Writing to ~/.claude/settings.json#/env
// fixes that for all sessions on this machine.
const USER_HOME = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
const USER_CLAUDE_SETTINGS_PATH = USER_HOME
  ? path.join(USER_HOME, '.claude', 'settings.json')
  : '';
// User-scope ~/.claude.json. Top-level mcpServers entries here are the only
// surface that Claude Code 2.1.100 still honors for HTTP-transport servers —
// the same definitions placed in project .mcp.json or in
// ~/.claude.json#/projects.<path>.mcpServers are silently dropped (LS-4595).
const USER_CLAUDE_JSON_PATH = USER_HOME
  ? path.join(USER_HOME, '.claude.json')
  : '';

// The `headersHelper` command each mirrored HTTP server declares — identical to
// project .mcp.json. It mints a short-lived per-connect bearer token from the
// machine credential (scripts/mcp-mint-token.mjs, LS-5092); the mirror therefore
// carries no static credential of its own.
const MCP_HEADERS_HELPER = 'node scripts/mcp-mint-token.mjs';

// Legacy PKCE OAuth vars written by the old interactive flow (removed in
// LS-5094). The new machine-credential flow never writes these keys, but any
// developer who ran the old flow still has them sitting in .env.local and
// settings files. Purge them on every run (LS-5219).
const STALE_OAUTH_KEYS = [
  'MCP_AUTH_TOKEN',
  'MCP_AUTH_REFRESH_TOKEN',
  'MCP_AUTH_EXPIRES_AT',
  'MCP_AUTH_CLIENT_ID',
];

// Keys mirrored from .env.local into Claude Code settings#/env so that Claude
// Code spawned from the Claude Desktop GUI (which does not source .env.local)
// — and Claude Code sessions running in a worktree (which has no project-local
// settings.local.json) — can still resolve `${MCP_*}` substitutions in
// .mcp.json at MCP server launch AND so the headersHelper can read the machine
// credential from the merged process env. Claude Code merges the top-level
// `env` block into its process env before MCP variable substitution.
//
// We mirror to BOTH the user-scope file (~/.claude/settings.json — primary
// fix, LS-4593) and the project-local file (.claude/settings.local.json —
// transitional, LS-4592).
const CLAUDE_SETTINGS_MIRRORED_KEYS = [
  'MCP_MACHINE_CLIENT_ID',
  'MCP_MACHINE_CLIENT_SECRET',
  'MCP_AUTH_COGNITO_DOMAIN',
  'MCP_JIRA_URL',
  'MCP_GITHUB_URL',
  'MCP_CI_URL',
];

// HTTP-transport MCP server definitions mirrored into
// ~/.claude.json#/mcpServers (LS-4595). Each entry is the server name and the
// .env.local key holding its API Gateway invoke URL. The URLs themselves
// live in terraform/main/lambda-mcp-api-gateway.tf and are also published to
// SSM (/legacy-sports-<env>/mcp/<name>/api-url). We prefer the values
// resolved from SSM into .env.local, but keep the production-dev defaults as
// a fallback so a refresh-only run still writes a usable definition.
const HTTP_MCP_SERVERS = [
  {
    name: 'legacy-sports-github',
    envKey: 'MCP_GITHUB_URL',
    fallbackUrl: 'https://lhnqee219k.execute-api.us-east-1.amazonaws.com',
  },
  {
    name: 'legacy-sports-jira',
    envKey: 'MCP_JIRA_URL',
    fallbackUrl: 'https://1vsogmvhh9.execute-api.us-east-1.amazonaws.com',
  },
  {
    name: 'legacy-sports-ci',
    envKey: 'MCP_CI_URL',
    fallbackUrl: 'https://i8yjn4el7d.execute-api.us-east-1.amazonaws.com',
  },
];

// Local LOGGER stub. The project rule (AGENTS.md) is to use LOGGER from
// @legacy-sports/logging, but this is a standalone `.mjs` script run via
// `node scripts/mcp-auth.mjs` ahead of any TS build/codegen — it cannot
// import workspace packages. This stub mirrors the LOGGER.{info,error,warn}
// interface so new diagnostics in this file stay consistent with that rule.
const LOGGER = {
  info: (...args) => process.stdout.write(args.join(' ') + '\n'),
  error: (...args) => process.stderr.write(args.join(' ') + '\n'),
  warn: (...args) => process.stderr.write(args.join(' ') + '\n'),
};

// ── CLI flags ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
// `--machine` is the default (and only) mode after the Phase 2 cutover; it is
// accepted as an explicit synonym so the documented runbook command
// (`node scripts/mcp-auth.mjs --machine`) works. `--setup`/`--force` force a
// re-pull even when .env.local already holds the credential.
const FORCE_MODE = args.includes('--force') || args.includes('--setup');

const PROFILE = (() => {
  const i = args.indexOf('--profile');
  return i !== -1
    ? args[i + 1]
    : (process.env['AWS_PROFILE'] ??
        process.env['MCP_AWS_PROFILE'] ??
        undefined);
})();

// ── AWS CLI helpers (SSM + Secrets Manager reads) ─────────────────────────────

function aws(service, subcommand, extraArgs = [], region) {
  const profileArgs = PROFILE ? ['--profile', PROFILE] : [];
  const regionArgs = region ? ['--region', region] : [];
  const result = spawnSync(
    'aws',
    [
      service,
      subcommand,
      ...extraArgs,
      ...profileArgs,
      ...regionArgs,
      '--output',
      'json',
    ],
    { encoding: 'utf8', env: { ...process.env } },
  );
  if (result.error)
    throw new Error(`Failed to spawn aws: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `aws ${service} ${subcommand} failed (exit ${result.status}):\n${result.stderr}`,
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return result.stdout.trim();
  }
}

// ── .env.local read/write ────────────────────────────────────────────────────

function readEnvLocal() {
  if (!fs.existsSync(ENV_LOCAL_PATH)) return {};
  const env = {};
  for (const line of fs.readFileSync(ENV_LOCAL_PATH, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function writeEnvLocal(updates) {
  let content = fs.existsSync(ENV_LOCAL_PATH)
    ? fs.readFileSync(ENV_LOCAL_PATH, 'utf8')
    : '';

  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) {
      content = content.replace(re, `${key}=${value}`);
    } else {
      if (content.length > 0 && !content.endsWith('\n')) content += '\n';
      content += `${key}=${value}\n`;
    }
  }

  fs.writeFileSync(ENV_LOCAL_PATH, content);
}

function purgeEnvLocal(keys) {
  if (!fs.existsSync(ENV_LOCAL_PATH)) return;
  let content = fs.readFileSync(ENV_LOCAL_PATH, 'utf8');
  let changed = false;
  for (const key of keys) {
    const re = new RegExp(`^${key}=.*\\n?`, 'm');
    if (re.test(content)) {
      content = content.replace(re, '');
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(ENV_LOCAL_PATH, content);
  }
}

function purgeEnvFromSettingsFile(settingsPath, keys) {
  if (!fs.existsSync(settingsPath)) return;
  const raw = fs.readFileSync(settingsPath, 'utf8');
  if (raw.trim().length === 0) return;
  let existing;
  try {
    existing = JSON.parse(raw);
  } catch {
    return;
  }
  if (!existing || typeof existing !== 'object' || Array.isArray(existing))
    return;
  const envBlock = existing['env'];
  if (!envBlock || typeof envBlock !== 'object' || Array.isArray(envBlock))
    return;
  let changed = false;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(envBlock, key)) {
      delete envBlock[key];
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + '\n');
  }
}

// ── Claude Code settings read/write ──────────────────────────────────────────
//
// Generic helper that merges `updates` into the top-level `env` block of a
// Claude Code settings JSON file, preserving every other key (permissions,
// enabledMcpjsonServers, model, statusLine, hooks, …). Refuses to clobber on
// malformed JSON or non-object top level.
function mergeEnvIntoSettingsFile(settingsPath, updates) {
  if (Object.keys(updates).length === 0) return;

  let existing = {};
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    if (raw.trim().length > 0) {
      try {
        existing = JSON.parse(raw);
      } catch (err) {
        throw new Error(
          `Refusing to overwrite malformed JSON at ${settingsPath}: ${err instanceof Error ? err.message : String(err)}. Fix or remove the file and re-run.`,
        );
      }
      if (
        existing === null ||
        typeof existing !== 'object' ||
        Array.isArray(existing)
      ) {
        throw new Error(
          `Refusing to overwrite ${settingsPath}: top-level value is not a JSON object.`,
        );
      }
    }
  } else {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  }

  const currentEnv =
    existing['env'] &&
    typeof existing['env'] === 'object' &&
    !Array.isArray(existing['env'])
      ? existing['env']
      : {};
  const mergedEnv = { ...currentEnv, ...updates };
  const next = { ...existing, env: mergedEnv };

  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2) + '\n');
}

// Merges HTTP-transport MCP server definitions into the top-level mcpServers
// block of ~/.claude.json. Preserves every other top-level key (projects map,
// numStartups, model, statusLine, …) and every other mcpServers entry. Writes
// atomically via temp-file + rename so a partial write can't corrupt the
// thousands-of-keys state file. Refuses to clobber on malformed JSON or
// non-object top level.
function mergeMcpServersIntoUserClaudeJson(claudeJsonPath, entries) {
  if (entries.length === 0) return;

  let existing = {};
  if (fs.existsSync(claudeJsonPath)) {
    const raw = fs.readFileSync(claudeJsonPath, 'utf8');
    if (raw.trim().length > 0) {
      try {
        existing = JSON.parse(raw);
      } catch (err) {
        throw new Error(
          `Refusing to overwrite malformed JSON at ${claudeJsonPath}: ${err instanceof Error ? err.message : String(err)}. Fix or remove the file and re-run.`,
        );
      }
      if (
        existing === null ||
        typeof existing !== 'object' ||
        Array.isArray(existing)
      ) {
        throw new Error(
          `Refusing to overwrite ${claudeJsonPath}: top-level value is not a JSON object.`,
        );
      }
    }
  } else {
    fs.mkdirSync(path.dirname(claudeJsonPath), { recursive: true });
  }

  const currentMcpServers =
    existing['mcpServers'] &&
    typeof existing['mcpServers'] === 'object' &&
    !Array.isArray(existing['mcpServers'])
      ? existing['mcpServers']
      : {};

  const mergedMcpServers = { ...currentMcpServers };
  for (const { name, definition } of entries) {
    mergedMcpServers[name] = definition;
  }
  const next = { ...existing, mcpServers: mergedMcpServers };

  const tmpPath = `${claudeJsonPath}.tmp-mcp-auth-${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2) + '\n');
  fs.renameSync(tmpPath, claudeJsonPath);
}

// ── SSM / Secrets Manager — read identifiers written by Terraform ────────────

function readSsmParameter(paramName) {
  try {
    const result = aws('ssm', 'get-parameter', ['--name', paramName]);
    return result['Parameter']['Value'];
  } catch {
    return null;
  }
}

// Read a Secrets Manager secret string. Unlike SSM reads above we surface the
// failure reason: a missing GetSecretValue permission or an absent secret is
// the most common provisioning blocker and the operator needs the AWS error.
function readSecretString(secretId) {
  try {
    const result = aws('secretsmanager', 'get-secret-value', [
      '--secret-id',
      secretId,
    ]);
    return result['SecretString'] ?? null;
  } catch (err) {
    LOGGER.warn(
      `Could not read Secrets Manager secret "${secretId}": ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function readApiUrlFromSsm(name, env) {
  return readSsmParameter(`/legacy-sports-${env}/mcp/${name}/api-url`);
}

function readMachineCognitoConfig(env) {
  return {
    machineClientId: readSsmParameter(
      `/legacy-sports-${env}/mcp/cognito/machine-client-id`,
    ),
    domain: readSsmParameter(`/legacy-sports-${env}/mcp/cognito/domain`),
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function printDivider() {
  LOGGER.info('─'.repeat(60));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // ── Step 0: purge stale legacy PKCE OAuth vars (LS-5219) ─────────────────
  // The old interactive flow (removed in LS-5094) wrote these keys; the new
  // machine-credential flow never reads them. Remove them from all three
  // target files so they don't mislead agents or developers.
  purgeEnvLocal(STALE_OAUTH_KEYS);
  if (USER_CLAUDE_SETTINGS_PATH)
    purgeEnvFromSettingsFile(USER_CLAUDE_SETTINGS_PATH, STALE_OAUTH_KEYS);
  purgeEnvFromSettingsFile(CLAUDE_SETTINGS_PATH, STALE_OAUTH_KEYS);

  const env = readEnvLocal();

  // Terraform environment (default dev; override via MCP_TF_ENV or --env flag)
  const tfEnvArg = args.find((a, i) => args[i - 1] === '--env');
  const tfEnv = tfEnvArg ?? process.env['MCP_TF_ENV'] ?? 'dev';

  // ── Step 1: machine client id + Cognito domain (SSM) ─────────────────────
  let machineClientId = env['MCP_MACHINE_CLIENT_ID'];
  let cognitoDomain = env['MCP_AUTH_COGNITO_DOMAIN'];
  if (!machineClientId || !cognitoDomain || FORCE_MODE) {
    LOGGER.info('Reading Cognito machine-client config from SSM…');
    const cfg = readMachineCognitoConfig(tfEnv);
    if (!cfg.machineClientId || !cfg.domain) {
      LOGGER.error(
        'Could not read Cognito machine-client config from SSM',
        new Error(
          `Expected /legacy-sports-${tfEnv}/mcp/cognito/machine-client-id and /legacy-sports-${tfEnv}/mcp/cognito/domain — run 'terraform apply' in terraform/main first (LS-5090 provisions these).`,
        ),
      );
      process.exit(1);
    }
    machineClientId = cfg.machineClientId;
    cognitoDomain = cfg.domain;
    writeEnvLocal({
      MCP_MACHINE_CLIENT_ID: machineClientId,
      MCP_AUTH_COGNITO_DOMAIN: cognitoDomain,
    });
    LOGGER.info(`Machine client ID: ${machineClientId}`);
    LOGGER.info(`Cognito domain:    ${cognitoDomain}`);
  }

  // ── Step 2: machine client secret (Secrets Manager) ──────────────────────
  // The long-lived secret never transits the MCP wire — scripts/mcp-mint-token.mjs
  // exchanges it with Cognito for a short-lived per-connect access token. We only
  // re-pull when it is absent locally or --force/--setup was passed, so a routine
  // refresh that just tops up URLs does not need GetSecretValue.
  if (!env['MCP_MACHINE_CLIENT_SECRET'] || FORCE_MODE) {
    LOGGER.info('Reading machine client secret from Secrets Manager…');
    const secret = readSecretString(`${tfEnv}/mcp-machine-client-secret`);
    if (!secret) {
      LOGGER.error(
        'Could not read the MCP machine client secret',
        new Error(
          `Expected Secrets Manager secret "${tfEnv}/mcp-machine-client-secret" (LS-5090). ` +
            `Verify it exists and your AWS credentials have secretsmanager:GetSecretValue for it.`,
        ),
      );
      process.exit(1);
    }
    // Written to gitignored .env.local only; never logged. scripts/mcp-mint-token.mjs
    // reads MCP_MACHINE_CLIENT_SECRET from process.env or .env.local.
    writeEnvLocal({ MCP_MACHINE_CLIENT_SECRET: secret });
    LOGGER.info('Machine client secret written to .env.local (not shown).');
  }

  // ── Step 3: populate MCP_*_URL from SSM ──────────────────────────────────
  const urlUpdates = {};
  let allUrlsFound = true;

  for (const [name, envKey] of [
    ['jira', 'MCP_JIRA_URL'],
    ['github', 'MCP_GITHUB_URL'],
    ['ci', 'MCP_CI_URL'],
  ]) {
    if (!env[envKey] || FORCE_MODE) {
      const url = readApiUrlFromSsm(name, tfEnv);
      if (url) {
        urlUpdates[envKey] = url;
        LOGGER.info(`${envKey}=${url}`);
      } else {
        LOGGER.warn(
          `${envKey}: SSM parameter not found for env "${tfEnv}". Run 'terraform apply' first, or set ${envKey} manually in .env.local.`,
        );
        allUrlsFound = false;
      }
    }
  }

  if (Object.keys(urlUpdates).length > 0) {
    writeEnvLocal(urlUpdates);
  }

  if (!allUrlsFound && FORCE_MODE) {
    LOGGER.info(
      'Once Terraform has applied, re-run this script to populate the missing URLs.',
    );
  }

  // ── Step 4: post-write self-check ─────────────────────────────────────────
  const REQUIRED_VARS = [
    'MCP_MACHINE_CLIENT_ID',
    'MCP_MACHINE_CLIENT_SECRET',
    'MCP_AUTH_COGNITO_DOMAIN',
    'MCP_JIRA_URL',
    'MCP_GITHUB_URL',
    'MCP_CI_URL',
  ];
  const finalEnv = readEnvLocal();
  const missing = REQUIRED_VARS.filter((k) => !finalEnv[k]);

  if (missing.length > 0) {
    printDivider();
    const hints = [
      `MCP servers will fail to connect until these are set.`,
      ...(missing.some((k) => k.endsWith('_URL'))
        ? [
            `For MCP_*_URL: run 'terraform apply' in terraform/main for env "${tfEnv}" so SSM params exist.`,
          ]
        : []),
      ...(missing.some((k) => k.startsWith('MCP_MACHINE_'))
        ? [
            `For MCP_MACHINE_*: ensure the Cognito machine grant (LS-5090) is applied and your AWS credentials can read its SSM params + Secrets Manager secret; then re-run with --force.`,
          ]
        : []),
    ].join(' ');
    LOGGER.error(
      `.env.local is missing required MCP var(s) after provisioning: ${missing.join(', ')}`,
      new Error(hints),
    );
    process.exit(1);
  }

  // ── Step 5: mirror MCP_* into Claude Code settings files ────────────────
  // Two write targets, both keyed on settings#/env (Claude Code merges this
  // block into the MCP server's process env before `${VAR}` substitution in
  // .mcp.json and before invoking the headersHelper).
  //
  //   1. ~/.claude/settings.json   — user-scope; merged into EVERY session
  //      regardless of project root, including worktree sessions whose own
  //      .claude/ directory has no settings.local.json (LS-4593).
  //   2. <repo>/.claude/settings.local.json  — project-local; retained as a
  //      transitional safety net for Claude Desktop launches that may still
  //      prefer project-local over user-scope (LS-4592).
  const mirrorUpdates = {};
  for (const key of CLAUDE_SETTINGS_MIRRORED_KEYS) {
    if (finalEnv[key]) mirrorUpdates[key] = finalEnv[key];
  }
  if (USER_CLAUDE_SETTINGS_PATH) {
    mergeEnvIntoSettingsFile(USER_CLAUDE_SETTINGS_PATH, mirrorUpdates);
  } else {
    LOGGER.warn(
      'Could not resolve HOME/USERPROFILE — skipping user-scope ~/.claude/settings.json mirror. Worktree sessions launched from Claude Desktop may fail to connect to URL-based MCP servers.',
    );
  }
  mergeEnvIntoSettingsFile(CLAUDE_SETTINGS_PATH, mirrorUpdates);

  // ── Step 6: mirror HTTP MCP server defs into ~/.claude.json ──────────────
  // Claude Code 2.1.100 silently drops HTTP-transport entries from project
  // .mcp.json and from ~/.claude.json#/projects.<path>.mcpServers; the
  // top-level user-scope mcpServers block is the only surface that still
  // works (LS-4595). Each entry declares the same `headersHelper` as project
  // .mcp.json, so the mirror carries no static credential — the helper mints a
  // short-lived per-connect token from the machine secret in settings#/env.
  if (USER_CLAUDE_JSON_PATH) {
    const entries = HTTP_MCP_SERVERS.map(({ name, envKey, fallbackUrl }) => ({
      name,
      definition: {
        type: 'http',
        url: finalEnv[envKey] ?? fallbackUrl,
        headersHelper: MCP_HEADERS_HELPER,
      },
    }));
    mergeMcpServersIntoUserClaudeJson(USER_CLAUDE_JSON_PATH, entries);
  } else {
    LOGGER.warn(
      'Could not resolve HOME/USERPROFILE — skipping ~/.claude.json#/mcpServers mirror. URL-based MCP servers will fail to connect on Claude Code 2.1.100+.',
    );
  }

  printDivider();
  LOGGER.info(
    `.env.local has MCP_MACHINE_CLIENT_ID + MCP_MACHINE_CLIENT_SECRET + MCP_AUTH_COGNITO_DOMAIN + MCP_JIRA_URL + MCP_GITHUB_URL + MCP_CI_URL.`,
  );
  LOGGER.info(
    `~/.claude/settings.json#/env mirrors the machine credential + URLs (user-scope; merged into every session, including worktrees).`,
  );
  LOGGER.info(
    `.claude/settings.local.json#/env mirrors the same vars (project-local; transitional safety net for Claude Desktop).`,
  );
  LOGGER.info(
    `~/.claude.json#/mcpServers mirrors legacy-sports-{github,jira,ci} HTTP defs with the headersHelper (no static credential; Claude Code 2.1.100+ workaround).`,
  );
  LOGGER.info(
    'Done. Restart Claude Code for the refreshed machine credential to take effect.',
  );
}

main().catch((err) => {
  LOGGER.error(
    'mcp-auth failed',
    err instanceof Error ? err : new Error(String(err)),
  );
  process.exit(1);
});
