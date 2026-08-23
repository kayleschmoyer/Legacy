// Integration coverage for the self-repair path of jira-link-check.mjs: the
// script is run as a real child process against a stub GitHub API, so the
// GET/PATCH round-trip and the exit code are exercised end to end.
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { parseMarker } from '../jira-link-marker.mjs';

const SCRIPT = fileURLToPath(
  new URL('../jira-link-check.mjs', import.meta.url),
);

/**
 * A stub GitHub API serving one PR. `patchStatus` forces the PATCH response
 * code so the write-failure branch can be exercised.
 */
function startStubApi({ storedBody, patchStatus = 200 }) {
  const state = { storedBody, patched: null, patchCount: 0 };
  const server = createServer((req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ body: state.storedBody }));
      return;
    }
    if (req.method === 'PATCH') {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        state.patchCount += 1;
        if (patchStatus === 200) {
          state.patched = JSON.parse(raw).body;
          state.storedBody = state.patched;
        }
        res.writeHead(patchStatus, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
      return;
    }
    res.writeHead(405);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, state, port: server.address().port }),
    );
  });
}

function runCheck(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], {
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const servers = [];
after(() => servers.forEach(({ server }) => server.close()));

async function withStub(options) {
  const stub = await startStubApi(options);
  servers.push(stub);
  return stub;
}

function env(port, { title, body, labels = [] }) {
  return {
    PR_TITLE: title,
    PR_BODY: body,
    PR_LABELS: JSON.stringify(labels),
    PR_NUMBER: '1',
    GITHUB_TOKEN: 'stub-token',
    GITHUB_REPOSITORY: 'bkrupa/legacy-sports',
    GITHUB_API_URL: `http://127.0.0.1:${port}`,
    JIRA_CREDENTIALS: '',
    GITHUB_STEP_SUMMARY: '',
  };
}

describe('jira-link-check self-repair', () => {
  it('repairs a stripped marker and passes', async () => {
    const body = '## Summary\n\nA body whose marker an MCP write dropped.';
    const { state, port } = await withStub({ storedBody: body });

    const result = await runCheck(
      env(port, { title: 'LS-1234 fix(x): y', body }),
    );

    assert.equal(result.code, 0, result.stderr);
    assert.equal(state.patchCount, 1);
    assert.equal(parseMarker(state.patched).primary, 'LS-1234');
    assert.match(state.patched, /\*\*Jira:\*\* \[LS-1234\]/);
    assert.match(result.stdout, /Repaired the jira-link marker/);
    assert.match(result.stdout, /passed \(primary: LS-1234\)/);
  });

  it('does not touch a body that already validates', async () => {
    const body = '<!-- jira-link\nprimary: LS-1234\n-->\n\n## Summary';
    const { state, port } = await withStub({ storedBody: body });

    const result = await runCheck(
      env(port, { title: 'LS-1234 fix(x): y', body }),
    );

    assert.equal(result.code, 0, result.stderr);
    assert.equal(state.patchCount, 0);
  });

  it('accepts a body fixed by the author after the event fired', async () => {
    const { state, port } = await withStub({
      storedBody: '<!-- jira-link\nprimary: LS-1234\n-->\n\n## Summary',
    });

    const result = await runCheck(
      env(port, { title: 'LS-1234 fix(x): y', body: '## Summary' }),
    );

    assert.equal(result.code, 0, result.stderr);
    assert.equal(state.patchCount, 0);
    assert.match(result.stdout, /edited after this check was triggered/);
  });

  it('fails without writing when the title carries no key', async () => {
    const body = '## Summary';
    const { state, port } = await withStub({ storedBody: body });

    const result = await runCheck(
      env(port, { title: 'chore(deps): bump', body }),
    );

    assert.equal(result.code, 1);
    assert.equal(state.patchCount, 0);
    assert.match(result.stdout, /no LS-#### key/);
    assert.match(result.stderr, /no `<!-- jira-link -->` marker/);
  });

  it('fails without writing when the marker disagrees with the title', async () => {
    const body = '<!-- jira-link\nprimary: LS-9999\n-->\n\n## Summary';
    const { state, port } = await withStub({ storedBody: body });

    const result = await runCheck(
      env(port, { title: 'LS-1234 fix(x): y', body }),
    );

    assert.equal(result.code, 1);
    assert.equal(state.patchCount, 0);
    assert.match(result.stdout, /judgement call/);
  });

  it('reports a write it could not make (read-only fork token)', async () => {
    const body = '## Summary';
    const { port } = await withStub({ storedBody: body, patchStatus: 403 });

    const result = await runCheck(
      env(port, { title: 'LS-1234 fix(x): y', body }),
    );

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Could not write the repaired PR body.*403/);
  });
});
