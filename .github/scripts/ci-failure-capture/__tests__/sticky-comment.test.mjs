/**
 * Unit tests for the multi-section sticky comment helper (sticky-comment.js).
 *
 * Run via: node --test .github/scripts/ci-failure-capture/__tests__/sticky-comment.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sticky = require(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../sticky-comment.js',
  ),
);
const {
  MARKER,
  emptyBody,
  parseSections,
  upsertSection,
  removeSection,
  applySection,
} = sticky;

describe('section string ops', () => {
  it('emptyBody carries the marker and an empty region', () => {
    const body = emptyBody('ci-pipeline');
    assert.match(
      body,
      new RegExp(MARKER.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')),
    );
    assert.deepEqual(parseSections(body), []);
  });

  it('inserts a section into an empty body', () => {
    let body = emptyBody('ci-pipeline');
    body = upsertSection(
      body,
      'pipeline',
      '### CI Pipeline\nfailed',
      'ci-pipeline',
    );
    const sections = parseSections(body);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].key, 'pipeline');
    assert.match(sections[0].content, /CI Pipeline/);
  });

  it('preserves other sections and renders in canonical order', () => {
    let body = emptyBody('ci-pipeline');
    // Insert out of order; expect SECTION_ORDER (pipeline, schema, migrations).
    body = upsertSection(
      body,
      'migrations',
      'migrations down',
      'check-migrations',
    );
    body = upsertSection(body, 'pipeline', 'pipeline down', 'ci-pipeline');
    body = upsertSection(body, 'schema', 'schema drift', 'check-schema');
    const keys = parseSections(body).map((s) => s.key);
    assert.deepEqual(keys, ['pipeline', 'schema', 'migrations']);
  });

  it('replaces an existing section without touching siblings', () => {
    let body = emptyBody('x');
    body = upsertSection(body, 'pipeline', 'first', 'ci-pipeline');
    body = upsertSection(body, 'schema', 'schema stays', 'check-schema');
    body = upsertSection(body, 'pipeline', 'second', 'ci-pipeline');
    const sections = parseSections(body);
    assert.equal(sections.find((s) => s.key === 'pipeline').content, 'second');
    assert.equal(
      sections.find((s) => s.key === 'schema').content,
      'schema stays',
    );
  });

  it('removes a section, leaving the rest intact', () => {
    let body = emptyBody('x');
    body = upsertSection(body, 'pipeline', 'p', 'ci-pipeline');
    body = upsertSection(body, 'schema', 's', 'check-schema');
    body = removeSection(body, 'schema', 'check-schema');
    const keys = parseSections(body).map((s) => s.key);
    assert.deepEqual(keys, ['pipeline']);
  });

  it('reinitialises a legacy flat comment that has the marker but no region', () => {
    const legacy = `${MARKER}\n## CI Pipeline Failed\n\nold flat content`;
    const body = upsertSection(
      legacy,
      'pipeline',
      'new content',
      'ci-pipeline',
    );
    const sections = parseSections(body);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].content, 'new content');
    assert.doesNotMatch(body, /old flat content/);
  });

  it('content with markdown that resembles markers does not break parsing', () => {
    let body = emptyBody('x');
    const tricky = 'has a `<!-- comment -->` and ``` fences ```';
    body = upsertSection(body, 'pipeline', tricky, 'ci-pipeline');
    assert.equal(parseSections(body)[0].content, tricky);
  });
});

// ── applySection (async, mocked octokit) ────────────────────────────────────

function makeGithub(initialComments = []) {
  const comments = [...initialComments];
  let nextId = 1000;
  const calls = { create: 0, update: 0 };
  const github = {
    paginate: async (fn, args) =>
      fn === github.rest.issues.listComments
        ? comments.map((c) => ({ ...c }))
        : [],
    rest: {
      issues: {
        listComments: async () => ({ data: comments.map((c) => ({ ...c })) }),
        createComment: async ({ body }) => {
          calls.create++;
          const c = { id: ++nextId, body };
          comments.push(c);
          return { data: c };
        },
        updateComment: async ({ comment_id, body }) => {
          calls.update++;
          const c = comments.find((x) => x.id === comment_id);
          if (c) c.body = body;
          return { data: c };
        },
      },
    },
  };
  return { github, comments, calls };
}

const context = { repo: { owner: 'o', repo: 'r' } };

describe('applySection', () => {
  it('creates the sticky comment when none exists', async () => {
    const { github, comments, calls } = makeGithub();
    const id = await applySection({
      github,
      context,
      prNumber: 7,
      key: 'pipeline',
      content: '### CI Pipeline — failed',
      producer: 'ci-pipeline',
    });
    assert.equal(calls.create, 1);
    assert.ok(id);
    assert.equal(comments.length, 1);
    assert.match(comments[0].body, /CI Pipeline — failed/);
  });

  it('updates the existing comment and preserves a sibling section', async () => {
    const { github } = makeGithub();
    await applySection({
      github,
      context,
      prNumber: 7,
      key: 'schema',
      content: 'schema drift detail',
      producer: 'check-schema',
    });
    await applySection({
      github,
      context,
      prNumber: 7,
      key: 'pipeline',
      content: 'pipeline detail',
      producer: 'ci-pipeline',
    });
    const stored = await github.paginate(github.rest.issues.listComments, {});
    const body = stored.find((c) => c.body.includes(MARKER)).body;
    const keys = parseSections(body).map((s) => s.key);
    assert.deepEqual(keys, ['pipeline', 'schema']);
  });

  it('is a no-op when removing a section from a PR with no comment', async () => {
    const { github, calls } = makeGithub();
    const id = await applySection({
      github,
      context,
      prNumber: 7,
      key: 'schema',
      content: null,
      producer: 'check-schema',
    });
    assert.equal(id, null);
    assert.equal(calls.create, 0);
    assert.equal(calls.update, 0);
  });

  it('removes a section when content is null', async () => {
    const { github } = makeGithub();
    await applySection({
      github,
      context,
      prNumber: 7,
      key: 'pipeline',
      content: 'p',
      producer: 'ci-pipeline',
    });
    await applySection({
      github,
      context,
      prNumber: 7,
      key: 'schema',
      content: 's',
      producer: 'check-schema',
    });
    await applySection({
      github,
      context,
      prNumber: 7,
      key: 'schema',
      content: null,
      producer: 'check-schema',
    });
    const stored = await github.paginate(github.rest.issues.listComments, {});
    const body = stored.find((c) => c.body.includes(MARKER)).body;
    assert.deepEqual(
      parseSections(body).map((s) => s.key),
      ['pipeline'],
    );
  });
});
