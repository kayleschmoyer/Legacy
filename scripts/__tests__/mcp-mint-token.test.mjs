/**
 * Tests for scripts/mcp-mint-token.mjs — the Claude Code `headersHelper` that
 * mints short-lived MCP bearer tokens via a Cognito client_credentials grant
 * (LS-5092, RFC AC-A3).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/mcp-mint-token.test.mjs
 *
 * Dependency-free (node:test only). The script is exercised as a subprocess —
 * the way Claude Code invokes a headersHelper — against a local HTTP server
 * standing in for Cognito's /oauth2/token endpoint, so no AWS/Cognito access
 * is needed. Because the subprocess and the fake server share nothing, the
 * tests can assert on exit code, stdout, and stderr exactly as Claude Code and
 * an operator would observe them. (Subprocesses are spawned async, not via
 * spawnSync, so the in-process fake server stays responsive.)
 */

import { test, before, after, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveScope, SERVER_SCOPES } from '../mcp-mint-token.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', 'mcp-mint-token.mjs');

// A recognizable secret value — every test asserts it never escapes to stdout
// (and never to stderr either).
const SECRET = 'super-secret-machine-value-DO-NOT-LEAK-7f3a9c';
const CLIENT_ID = 'machine-client-abc123';

// Env file that does not exist, so the script's .env.local fallback is empty
// and config comes solely from the env vars each test sets (hermetic).
const NO_ENV_FILE = join(tmpdir(), 'mcp-mint-token-nonexistent-9c1f.env');

// ── Fake Cognito token endpoint ─────────────────────────────────────────────

let server;
let baseUrl;
/** Per-test responder: receives the parsed request, returns {status, body}. */
let respond;
/** Captures the most recent request the script made to the fake endpoint. */
let lastRequest;

before(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const params = new URLSearchParams(raw);
      lastRequest = {
        url: req.url,
        authorization: req.headers['authorization'],
        grantType: params.get('grant_type'),
        scope: params.get('scope'),
      };
      const { status, body } = respond(lastRequest);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
});

// ── Subprocess helper ───────────────────────────────────────────────────────

function runMint(overrides) {
  const env = { ...process.env };
  // Strip anything inherited from the developer/CI shell so tests are hermetic.
  delete env['MCP_MACHINE_CLIENT_ID'];
  delete env['MCP_MACHINE_CLIENT_SECRET'];
  delete env['MCP_AUTH_COGNITO_DOMAIN'];
  delete env['CLAUDE_CODE_MCP_SERVER_NAME'];
  env['MCP_MINT_ENV_FILE'] = NO_ENV_FILE;
  Object.assign(env, overrides);

  return new Promise((res) => {
    const child = spawn(process.execPath, [SCRIPT], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => res({ code, stdout, stderr }));
  });
}

/** The happy-path env: full credentials + fake Cognito + a real server name. */
function validEnv(serverName) {
  return {
    CLAUDE_CODE_MCP_SERVER_NAME: serverName,
    MCP_MACHINE_CLIENT_ID: CLIENT_ID,
    MCP_MACHINE_CLIENT_SECRET: SECRET,
    MCP_AUTH_COGNITO_DOMAIN: baseUrl,
  };
}

// ── Successful mint ─────────────────────────────────────────────────────────

describe('successful mint', () => {
  test('emits an Authorization: Bearer header as JSON on stdout', async () => {
    respond = () => ({
      status: 200,
      body: {
        access_token: 'mock.access.token',
        expires_in: 3600,
        token_type: 'Bearer',
      },
    });

    const { code, stdout, stderr } = await runMint(
      validEnv('legacy-sports-jira'),
    );

    assert.equal(code, 0, `expected exit 0, got ${code}. stderr: ${stderr}`);
    const headers = JSON.parse(stdout);
    assert.deepEqual(headers, { Authorization: 'Bearer mock.access.token' });
  });

  test('uses the client_credentials grant scoped to the calling server only', async () => {
    // Each server name must request ONLY its own per-server scope (least
    // privilege — RFC AC-A5/OQ-4), and authenticate with HTTP Basic.
    for (const [serverName, expectedScope] of Object.entries(SERVER_SCOPES)) {
      respond = () => ({ status: 200, body: { access_token: 'tok' } });

      const { code } = await runMint(validEnv(serverName));
      assert.equal(code, 0);
      assert.equal(lastRequest.grantType, 'client_credentials');
      assert.equal(
        lastRequest.scope,
        expectedScope,
        `wrong scope for ${serverName}`,
      );

      const expectedBasic =
        'Basic ' + Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64');
      assert.equal(lastRequest.authorization, expectedBasic);
    }
  });
});

// ── Missing secret ──────────────────────────────────────────────────────────

describe('missing secret', () => {
  test('exits non-zero with an actionable message and no stdout', async () => {
    respond = () => ({
      status: 200,
      body: { access_token: 'should-not-get-here' },
    });

    const env = validEnv('legacy-sports-github');
    delete env.MCP_MACHINE_CLIENT_SECRET;

    const { code, stdout, stderr } = await runMint(env);

    assert.notEqual(
      code,
      0,
      'expected a non-zero exit when the secret is missing',
    );
    assert.equal(stdout, '', 'no header should be emitted without a secret');
    assert.match(stderr, /MCP_MACHINE_CLIENT_SECRET/);
    // Actionable: points at provisioning + storage location.
    assert.match(stderr, /LS-5090|keychain|\.env\.local/);
  });
});

// ── Cognito error path ──────────────────────────────────────────────────────

describe('cognito error', () => {
  test('surfaces the HTTP status and exits non-zero', async () => {
    respond = () => ({ status: 400, body: { error: 'invalid_client' } });

    const { code, stdout, stderr } = await runMint(
      validEnv('legacy-sports-ci'),
    );

    assert.notEqual(code, 0, 'expected a non-zero exit on a Cognito error');
    assert.equal(
      stdout,
      '',
      'no header should be emitted on a failed exchange',
    );
    assert.match(stderr, /HTTP 400/);
    assert.match(stderr, /invalid_client/);
  });

  test('exits non-zero when the endpoint is unreachable', async () => {
    respond = () => ({ status: 200, body: {} });
    // Point at a closed port so the fetch connection is refused.
    const env = validEnv('legacy-sports-jira');
    env.MCP_AUTH_COGNITO_DOMAIN = 'http://127.0.0.1:1';

    const { code, stdout, stderr } = await runMint(env);

    assert.notEqual(code, 0);
    assert.equal(stdout, '');
    assert.match(stderr, /Cognito token endpoint/);
  });
});

// ── Secret never on stdout (security gate, AC-A3/AC-A4) ──────────────────────

describe('secret confidentiality', () => {
  test('the machine secret never appears on stdout or stderr — success path', async () => {
    respond = () => ({
      status: 200,
      body: { access_token: 'mock.access.token' },
    });

    const { stdout, stderr } = await runMint(validEnv('legacy-sports-jira'));

    assert.ok(!stdout.includes(SECRET), 'secret leaked to stdout');
    assert.ok(!stderr.includes(SECRET), 'secret leaked to stderr');
  });

  test('the machine secret never appears on stdout or stderr — error path', async () => {
    // Even when Cognito echoes the request back in an error, our diagnostics
    // must not include the secret.
    respond = (reqInfo) => ({
      status: 401,
      body: {
        error: 'unauthorized',
        received_authorization: reqInfo.authorization,
      },
    });

    const { stdout, stderr } = await runMint(validEnv('legacy-sports-github'));

    assert.equal(stdout, '');
    assert.ok(!stdout.includes(SECRET), 'secret leaked to stdout');
    assert.ok(!stderr.includes(SECRET), 'raw secret leaked to stderr');
  });
});

// ── Scope resolution (direct unit, no subprocess) ────────────────────────────

describe('resolveScope', () => {
  test('maps each known server to its scope', () => {
    assert.equal(resolveScope('legacy-sports-jira'), 'mcp/jira');
    assert.equal(resolveScope('legacy-sports-github'), 'mcp/github');
    assert.equal(resolveScope('legacy-sports-ci'), 'mcp/ci');
  });

  test('throws for a missing server name', () => {
    assert.throws(() => resolveScope(undefined), /CLAUDE_CODE_MCP_SERVER_NAME/);
  });

  test('throws for an unknown server name', () => {
    assert.throws(() => resolveScope('legacy-sports-unknown'), /No MCP scope/);
  });
});
