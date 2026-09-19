/**
 * Tests for the `ref` option added to `collect()` (LS-10149): measuring a
 * git ref (e.g. `origin/main`) via `git show`/`git ls-tree` plumbing instead
 * of a hand-rolled worktree + node_modules symlink.
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/mcp-api-reference-collect-ref.test.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from '../mcp-api-reference/collect.mjs';

const REPO_ROOT = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
);

function headIsClean() {
  try {
    return (
      execFileSync('git', ['status', '--porcelain', '--', 'tools/mcp'], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
      }).trim() === ''
    );
  } catch {
    return false;
  }
}

test('collect({ ref: "HEAD" }) matches the working tree when tools/mcp has no uncommitted changes', (t) => {
  // Skip rather than false-fail in a session that has genuinely changed a
  // tool definition mid-branch — this test asserts ref-vs-disk parity, not
  // that tools/mcp is untouched.
  if (!headIsClean()) {
    t.skip(
      'tools/mcp has uncommitted changes; ref-vs-working-tree parity does not apply',
    );
    return;
  }

  const workingTree = collect(REPO_ROOT);
  const atHead = collect(REPO_ROOT, { ref: 'HEAD' });

  assert.equal(atHead.toolCount, workingTree.toolCount);
  assert.equal(atHead.serverCount, workingTree.serverCount);
  assert.deepEqual(
    atHead.servers.map((s) => [s.id, s.toolCount]),
    workingTree.servers.map((s) => [s.id, s.toolCount]),
  );
});

test('collect({ ref }) resolves sibling schema files (e.g. jira-server/src/schemas.ts) the same as disk', (t) => {
  if (!headIsClean()) {
    t.skip(
      'tools/mcp has uncommitted changes; ref-vs-working-tree parity does not apply',
    );
    return;
  }

  const workingTree = collect(REPO_ROOT);
  const atHead = collect(REPO_ROOT, { ref: 'HEAD' });

  const jiraDisk = workingTree.servers.find(
    (s) => s.id === 'legacy-sports-jira',
  );
  const jiraRef = atHead.servers.find((s) => s.id === 'legacy-sports-jira');
  assert.ok(
    jiraDisk && jiraRef,
    'expected a legacy-sports-jira server in both models',
  );

  // A shared schema resolves to its real zod type (not left as a bare
  // identifier) only when the sibling file was actually read — this is the
  // regression this test guards: gitReader.listFiles() must return bare
  // filenames, not git-ls-tree's path-prefixed entries (or `join(dir, name)`
  // in extract.mjs silently fails to find every sibling and each shared
  // schema degrades to `type: "<identifier>"`).
  const diskTypes = JSON.stringify(jiraDisk.tools.map((tool) => tool.inputs));
  const refTypes = JSON.stringify(jiraRef.tools.map((tool) => tool.inputs));
  assert.equal(refTypes, diskTypes);
});

test('collect({ ref }) on a nonexistent ref yields an empty model rather than throwing', () => {
  const model = collect(REPO_ROOT, { ref: 'refs/does-not-exist-ls-10149' });
  assert.equal(model.toolCount, 0);
  for (const server of model.servers) {
    assert.equal(server.toolCount, 0);
    assert.deepEqual(server.transports, []);
  }
});
