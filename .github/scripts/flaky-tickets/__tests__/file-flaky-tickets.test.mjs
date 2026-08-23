/**
 * Unit tests for the nightly flaky-test → Jira filing helpers (LS-9659).
 *
 * Run via: node --test .github/scripts/flaky-tickets/__tests__/*.test.mjs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  OCCURRENCE_MARKER,
  SUMMARY_PREFIX,
  buildDescriptionAdf,
  buildOccurrenceCommentAdf,
  canonicalSummary,
  countOccurrenceComments,
  groupFlakyBySpec,
  nextOccurrence,
  pickExistingIssue,
  renderSummaryMd,
} from '../file-flaky-tickets.mjs';

const SPEC = 'apps/web-e2e/src/tests/draft.spec.ts';

// ---------------------------------------------------------------------------
// groupFlakyBySpec
// ---------------------------------------------------------------------------

test('groupFlakyBySpec groups entries by file and sorts specs + titles', () => {
  const grouped = groupFlakyBySpec([
    { file: 'b.spec.ts', title: 'zeta' },
    { file: 'a.spec.ts', title: 'beta' },
    { file: 'b.spec.ts', title: 'alpha' },
    { file: 'a.spec.ts', title: 'alpha' },
  ]);
  assert.deepEqual(grouped, [
    { spec: 'a.spec.ts', titles: ['alpha', 'beta'] },
    { spec: 'b.spec.ts', titles: ['alpha', 'zeta'] },
  ]);
});

test('groupFlakyBySpec de-duplicates repeated titles for one spec', () => {
  const grouped = groupFlakyBySpec([
    { file: 'a.spec.ts', title: 'same test' },
    { file: 'a.spec.ts', title: 'same test' },
  ]);
  assert.deepEqual(grouped, [{ spec: 'a.spec.ts', titles: ['same test'] }]);
});

test('groupFlakyBySpec is defensive against malformed input', () => {
  assert.deepEqual(groupFlakyBySpec(undefined), []);
  assert.deepEqual(groupFlakyBySpec('nope'), []);
  assert.deepEqual(
    groupFlakyBySpec([null, {}, { file: '' }, { file: 'a.spec.ts' }]),
    [{ spec: 'a.spec.ts', titles: ['(untitled)'] }],
  );
});

// ---------------------------------------------------------------------------
// canonicalSummary / pickExistingIssue
// ---------------------------------------------------------------------------

test('canonicalSummary uses the LS-9659 canonical prefix', () => {
  assert.equal(canonicalSummary(SPEC), `E2E flaky: ${SPEC}`);
  assert.ok(canonicalSummary(SPEC).startsWith(SUMMARY_PREFIX));
});

const issue = (key, summary, statusCategoryKey, created) => ({
  key,
  fields: {
    summary,
    created,
    status: { statusCategory: { key: statusCategoryKey } },
  },
});

test('pickExistingIssue returns the exact-summary non-Done match', () => {
  const summary = canonicalSummary(SPEC);
  const picked = pickExistingIssue(
    [
      issue(
        'LS-1',
        `${summary} (older sibling)`,
        'new',
        '2026-08-01T00:00:00.000-0400',
      ),
      issue('LS-2', summary, 'new', '2026-08-02T00:00:00.000-0400'),
    ],
    summary,
  );
  assert.equal(picked.key, 'LS-2');
});

test('pickExistingIssue prefers the newest match by created date', () => {
  const summary = canonicalSummary(SPEC);
  const picked = pickExistingIssue(
    [
      issue('LS-1', summary, 'new', '2026-08-01T00:00:00.000-0400'),
      issue('LS-2', summary, 'indeterminate', '2026-08-10T00:00:00.000-0400'),
    ],
    summary,
  );
  assert.equal(picked.key, 'LS-2');
});

test('pickExistingIssue ignores Done tickets so a recurrence files fresh', () => {
  const summary = canonicalSummary(SPEC);
  assert.equal(
    pickExistingIssue(
      [issue('LS-1', summary, 'done', '2026-08-01T00:00:00.000-0400')],
      summary,
    ),
    null,
  );
  assert.equal(pickExistingIssue([], summary), null);
  assert.equal(pickExistingIssue(undefined, summary), null);
});

// ---------------------------------------------------------------------------
// Occurrence counting
// ---------------------------------------------------------------------------

const markerComment = () => ({
  body: {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `${OCCURRENCE_MARKER} Flaky again` }],
      },
    ],
  },
});

test('countOccurrenceComments counts only marker comments', () => {
  assert.equal(countOccurrenceComments(undefined), 0);
  assert.equal(
    countOccurrenceComments([
      markerComment(),
      { body: { type: 'doc', version: 1, content: [] } },
      markerComment(),
    ]),
    2,
  );
});

test('nextOccurrence counts the description as occurrence 1', () => {
  // No prior occurrence comments → tonight is the 2nd observed night.
  assert.equal(nextOccurrence(0), 2);
  assert.equal(nextOccurrence(3), 5);
});

// ---------------------------------------------------------------------------
// ADF builders
// ---------------------------------------------------------------------------

test('buildDescriptionAdf lists titles and links the first-seen run', () => {
  const doc = buildDescriptionAdf({
    spec: SPEC,
    titles: ['League setup › drafts a player'],
    runUrl: 'https://github.com/bkrupa/legacy-sports/actions/runs/123',
  });
  const text = JSON.stringify(doc);
  assert.equal(doc.type, 'doc');
  assert.ok(text.includes(SPEC));
  assert.ok(text.includes('League setup › drafts a player'));
  assert.ok(text.includes('actions/runs/123'));
  assert.ok(text.includes('retries=0'));
});

test('buildOccurrenceCommentAdf carries the marker, count and run link', () => {
  const doc = buildOccurrenceCommentAdf({
    occurrence: 4,
    titles: ['League setup › drafts a player'],
    runUrl: 'https://github.com/bkrupa/legacy-sports/actions/runs/456',
  });
  const text = JSON.stringify(doc);
  assert.ok(text.includes(OCCURRENCE_MARKER));
  assert.ok(text.includes('occurrence 4'));
  assert.ok(text.includes('actions/runs/456'));
  // The marker comment must count as an occurrence comment itself.
  assert.equal(countOccurrenceComments([{ body: doc }]), 1);
});

// ---------------------------------------------------------------------------
// Summary rendering
// ---------------------------------------------------------------------------

test('renderSummaryMd renders a table row per spec and neutralizes pipes', () => {
  const md = renderSummaryMd([
    { spec: 'a|b.spec.ts', key: 'LS-10', action: 'created' },
    { spec: 'c.spec.ts', key: 'LS-11', action: 'updated (occurrence 3)' },
  ]);
  assert.ok(md.includes('| a/b.spec.ts | LS-10 | created |'));
  assert.ok(md.includes('| c.spec.ts | LS-11 | updated (occurrence 3) |'));
});

test('renderSummaryMd handles a night with no flaky tests', () => {
  assert.ok(renderSummaryMd([]).includes('No flaky tests tonight.'));
});
