/**
 * Tests that the generated MCP API reference carries no derived counts
 * (LS-11018).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/mcp-api-reference-merge-safe.test.mjs
 *
 * A committed total is not merge-safe: two PRs that each add a tool both
 * rewrite the same count line to the same new value, git merges the identical
 * edits cleanly, and the combined tree is stale. The merge queue builds its
 * batch branches with GitHub's server-side merge, which ignores the local
 * merge driver in .gitattributes, so the drift surfaced only as a failed batch
 * CI run, once per bisection level. These tests pin the invariant: artifacts
 * hold only `servers[].tools`, and the page derives every count itself.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { artifactModel } from '../mcp-api-reference/collect.mjs';
import { renderCatalog } from '../mcp-api-reference/render-catalog.mjs';
import { render } from '../mcp-api-reference/render.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function tool(name, paramNames) {
  return {
    name,
    description: `${name} does a thing.`,
    inputs: Object.fromEntries(
      paramNames.map((p) => [p, { type: 'string', optional: true }]),
    ),
  };
}

// 2 servers, 3 tools, 5 params, 2 local, 1 hosted. Built with the counts the
// in-memory model carries, so the tests prove they are dropped.
function fixtureModel() {
  const servers = [
    {
      id: 'alpha',
      label: 'Alpha',
      summary: 'Alpha server.',
      packageDir: 'tools/mcp/alpha',
      transports: ['stdio', 'hosted'],
      tools: [tool('alpha_one', ['a', 'b']), tool('alpha_two', ['c'])],
    },
    {
      id: 'beta',
      label: 'Beta',
      summary: 'Beta server.',
      packageDir: 'tools/mcp/beta',
      transports: ['stdio'],
      tools: [tool('beta_one', ['d', 'e'])],
    },
  ].map((s) => ({ ...s, toolCount: s.tools.length }));
  return {
    generatedFrom: 'tools/mcp/*/src/{index,lambda}.ts',
    serverCount: servers.length,
    toolCount: 3,
    servers,
  };
}

/**
 * Run the page's inline script against a stub DOM and return the text it
 * writes into each `[data-stat]` element and the result counter.
 */
function runPageScript(html) {
  const modelJson = html.match(
    /<script id="mcp-model" type="application\/json">([\s\S]*?)<\/script>/,
  )[1];
  const pageScript = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  const statKeys = [...html.matchAll(/<dd data-stat="(\w+)"><\/dd>/g)].map(
    (m) => m[1],
  );

  // Listeners and observers are never fired here; they only need to exist.
  const noop = () => undefined;
  const element = (extra = {}) => ({
    textContent: '',
    innerHTML: '',
    value: '',
    querySelectorAll: () => [],
    addEventListener: noop,
    setAttribute: noop,
    ...extra,
  });
  const stats = statKeys.map((stat) => element({ dataset: { stat } }));
  const byId = {
    'mcp-model': element({ textContent: modelJson }),
    'result-count': element(),
  };
  const document = {
    getElementById: (id) => (byId[id] ??= element()),
    querySelectorAll: (selector) => (selector === '[data-stat]' ? stats : []),
    addEventListener: noop,
  };
  vm.runInNewContext(pageScript, {
    document,
    location: { hash: '' },
    window: { addEventListener: noop },
    setTimeout,
    clearTimeout,
    IntersectionObserver: class {
      observe = noop;
    },
  });

  return {
    stats: Object.fromEntries(
      stats.map((el) => [el.dataset.stat, el.textContent]),
    ),
    resultCount: byId['result-count'].textContent,
  };
}

test('artifactModel drops every derived count and leaves the input intact', () => {
  const model = fixtureModel();
  const committed = artifactModel(model);

  assert.deepEqual(Object.keys(committed).sort(), ['generatedFrom', 'servers']);
  for (const server of committed.servers) {
    assert.equal('toolCount' in server, false);
  }
  assert.equal(committed.servers[0].tools.length, 2);
  // The budget check and CLI output still read the in-memory counts.
  assert.equal(model.toolCount, 3);
  assert.equal(model.servers[0].toolCount, 2);
});

test('the rendered page writes no count into its markup', () => {
  const html = render(artifactModel(fixtureModel()));

  for (const stat of ['servers', 'tools', 'params', 'local', 'hosted']) {
    assert.match(html, new RegExp(`<dd data-stat="${stat}"></dd>`));
  }
  assert.doesNotMatch(html, /<dd>\d+<\/dd>/);
  assert.doesNotMatch(html, /"toolCount"|"serverCount"/);
});

test('the page script derives the stats from the embedded model', () => {
  const { stats, resultCount } = runPageScript(
    render(artifactModel(fixtureModel())),
  );

  assert.deepEqual(stats, {
    servers: '2',
    tools: '3',
    params: '5',
    local: '2',
    hosted: '1',
  });
  assert.equal(resultCount, '3 tools');
});

test('a single-server page derives its stats and keeps the static transport', () => {
  const committed = artifactModel(fixtureModel());
  const html = render(
    { ...committed, servers: [committed.servers[0]] },
    { scope: { label: 'Alpha' } },
  );

  assert.match(html, /<dd>Both<\/dd>/);
  assert.deepEqual(runPageScript(html).stats, { tools: '2', params: '3' });
});

test('the skill catalog states no tool count', () => {
  const [server] = artifactModel(fixtureModel()).servers;
  assert.doesNotMatch(renderCatalog(server), /\d+ tools?\./);
});

test('the committed api-reference.json carries no count fields', () => {
  const committed = readFileSync(
    join(REPO_ROOT, 'docs/mcp/api-reference.json'),
    'utf-8',
  );
  assert.doesNotMatch(committed, /"(toolCount|serverCount)":/);
});
