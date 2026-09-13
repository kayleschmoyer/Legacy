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
const { statusHeading, shortSha } = require(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../render.js'),
);
const {
  MARKER,
  emptyBody,
  parseSections,
  upsertSection,
  removeSection,
  reannotateBody,
  applySection,
  withRetry,
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

// ── withRetry (LS-9641: installation-wide primary rate limit) ──────────────

describe('withRetry', () => {
  it('retries the primary installation rate limit (403, "API rate limit exceeded")', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls === 1) {
        const err = new Error('API rate limit exceeded for installation');
        err.status = 403;
        throw err;
      }
      return 'ok';
    });
    assert.equal(result, 'ok');
    assert.equal(calls, 2);
  });

  it('still retries the secondary rate limit', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls === 1) {
        const err = new Error('You have exceeded a secondary rate limit');
        err.status = 403;
        throw err;
      }
      return 'ok';
    });
    assert.equal(result, 'ok');
    assert.equal(calls, 2);
  });

  it('does not retry a non-rate-limit 403 (e.g. permissions)', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => {
        calls++;
        const err = new Error('Resource not accessible by integration');
        err.status = 403;
        throw err;
      }),
      /not accessible/,
    );
    assert.equal(calls, 1);
  });

  it('throws once retries are exhausted', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => {
        calls++;
        const err = new Error('API rate limit exceeded for installation');
        err.status = 403;
        throw err;
      }, 2),
      /rate limit/i,
    );
    assert.equal(calls, 2);
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

  it('survives a transient primary rate limit on the underlying API call (LS-9641)', async () => {
    const { github, comments, calls } = makeGithub();
    const realPaginate = github.paginate;
    let paginateAttempts = 0;
    github.paginate = async (...args) => {
      paginateAttempts++;
      if (paginateAttempts === 1) {
        const err = new Error('API rate limit exceeded for installation');
        err.status = 403;
        throw err;
      }
      return realPaginate(...args);
    };

    const id = await applySection({
      github,
      context,
      prNumber: 7,
      key: 'schema',
      content: 'schema drift detail',
      producer: 'check-schema',
    });

    assert.ok(id);
    assert.equal(calls.create, 1);
    assert.match(comments[0].body, /schema drift detail/);
  });

  // ── staleness marking (LS-10100) ──────────────────────────────────────────
  // Reproduces the ticket's PR #7954 shape: a non-pipeline producer
  // (check-migrations) edits its own section after the head has moved past
  // the commit the pipeline section still names. Previously the pipeline
  // section was left carrying that superseded result with no marker at all.

  const OLD_SHA = 'c20e4850000000000000000000000000000000';
  const NEW_SHA = 'e26ffc50000000000000000000000000000000';

  it('flags a sibling section as stale when a different producer writes with a newer head', async () => {
    const { github } = makeGithub();

    await applySection({
      github,
      context,
      prNumber: 7,
      key: 'pipeline',
      content: statusHeading('CI Pipeline', 'fail', '1 check failed', OLD_SHA),
      producer: 'ci-pipeline',
      headSha: OLD_SHA,
    });

    // check-migrations updates only its own section, but the head has since
    // moved on — this write should still surface the pipeline section as
    // superseded rather than leaving it silently stale.
    await applySection({
      github,
      context,
      prNumber: 7,
      key: 'migrations',
      content: 'migrations ok',
      producer: 'check-migrations',
      headSha: NEW_SHA,
    });

    const stored = await github.paginate(github.rest.issues.listComments, {});
    const body = stored.find((c) => c.body.includes(MARKER)).body;
    const pipeline = parseSections(body).find((s) => s.key === 'pipeline');
    assert.match(pipeline.content, /Superseded/);
    assert.match(pipeline.content, new RegExp('`' + shortSha(OLD_SHA) + '`'));
    assert.match(pipeline.content, new RegExp('`' + shortSha(NEW_SHA) + '`'));
  });

  it('does not mark sections stale when the head has not moved', async () => {
    const { github } = makeGithub();

    await applySection({
      github,
      context,
      prNumber: 7,
      key: 'pipeline',
      content: statusHeading('CI Pipeline', 'pass', undefined, OLD_SHA),
      producer: 'ci-pipeline',
      headSha: OLD_SHA,
    });
    await applySection({
      github,
      context,
      prNumber: 7,
      key: 'migrations',
      content: 'migrations ok',
      producer: 'check-migrations',
      headSha: OLD_SHA,
    });

    const stored = await github.paginate(github.rest.issues.listComments, {});
    const body = stored.find((c) => c.body.includes(MARKER)).body;
    const pipeline = parseSections(body).find((s) => s.key === 'pipeline');
    assert.doesNotMatch(pipeline.content, /Superseded/);
  });

  it('clears a stale marker once the section itself catches up to the head', async () => {
    const { github } = makeGithub();

    await applySection({
      github,
      context,
      prNumber: 7,
      key: 'pipeline',
      content: statusHeading('CI Pipeline', 'fail', '1 check failed', OLD_SHA),
      producer: 'ci-pipeline',
      headSha: OLD_SHA,
    });
    await applySection({
      github,
      context,
      prNumber: 7,
      key: 'migrations',
      content: 'migrations ok',
      producer: 'check-migrations',
      headSha: NEW_SHA,
    });
    // ci-pipeline re-runs on the new head and reports green.
    await applySection({
      github,
      context,
      prNumber: 7,
      key: 'pipeline',
      content: statusHeading('CI Pipeline', 'pass', undefined, NEW_SHA),
      producer: 'ci-pipeline',
      headSha: NEW_SHA,
    });

    const stored = await github.paginate(github.rest.issues.listComments, {});
    const body = stored.find((c) => c.body.includes(MARKER)).body;
    const pipeline = parseSections(body).find((s) => s.key === 'pipeline');
    assert.doesNotMatch(pipeline.content, /Superseded/);
    assert.match(pipeline.content, new RegExp('commit ' + shortSha(NEW_SHA)));
  });

  it('reannotateBody is a no-op without a headSha and leaves bodies without a region untouched', () => {
    const flat = `${MARKER}\nlegacy flat body`;
    assert.equal(reannotateBody(flat, NEW_SHA), flat);

    let body = emptyBody('x');
    body = upsertSection(
      body,
      'pipeline',
      statusHeading('CI Pipeline', 'fail', '1 check failed', OLD_SHA),
      'ci-pipeline',
    );
    assert.equal(reannotateBody(body, ''), body);
    assert.equal(reannotateBody(body, undefined), body);
  });
});
