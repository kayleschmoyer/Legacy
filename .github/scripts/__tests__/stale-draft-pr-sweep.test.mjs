/**
 * Unit tests for stale-draft-pr-sweep.js (LS-10975).
 *
 * Run via: node --test .github/scripts/__tests__/stale-draft-pr-sweep.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  NUDGE_MARKER,
  NUDGE_AFTER_MS,
  PROMOTE_AFTER_MS,
  decideStaleDraft,
  nudgeBody,
} = require('../stale-draft-pr-sweep.js');

const NOW = Date.parse('2026-10-07T12:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const draft = (labels = ['agent-in-progress']) => ({
  draft: true,
  labels: labels.map((name) => ({ name })),
});

describe('decideStaleDraft', () => {
  it('skips non-drafts', () => {
    const r = decideStaleDraft({
      pr: { draft: false, labels: [] },
      lastPushAt: ago(PROMOTE_AFTER_MS),
      now: NOW,
    });
    assert.equal(r.action, 'skip');
  });

  it('skips drafts without the agent label', () => {
    const r = decideStaleDraft({
      pr: draft([]),
      lastPushAt: ago(PROMOTE_AFTER_MS),
      now: NOW,
    });
    assert.equal(r.action, 'skip');
  });

  it('honours keep-draft and sweep-claimed', () => {
    for (const label of ['keep-draft', 'sweep-claimed']) {
      const r = decideStaleDraft({
        pr: draft(['agent-in-progress', label]),
        lastPushAt: ago(PROMOTE_AFTER_MS * 2),
        now: NOW,
      });
      assert.equal(r.action, 'skip');
    }
  });

  it('skips recently pushed drafts', () => {
    const r = decideStaleDraft({
      pr: draft(),
      lastPushAt: ago(NUDGE_AFTER_MS - 1000),
      now: NOW,
    });
    assert.equal(r.action, 'skip');
  });

  it('nudges once a draft is idle past the nudge threshold', () => {
    const r = decideStaleDraft({
      pr: draft(),
      lastPushAt: ago(NUDGE_AFTER_MS + 1000),
      now: NOW,
    });
    assert.equal(r.action, 'nudge');
  });

  it('does not nudge twice', () => {
    const r = decideStaleDraft({
      pr: draft(),
      lastPushAt: ago(NUDGE_AFTER_MS + 1000),
      comments: [nudgeBody()],
      now: NOW,
    });
    assert.equal(r.action, 'skip');
    assert.match(r.reason, /already nudged/);
  });

  it('promotes past the promote threshold, nudged or not', () => {
    for (const comments of [[], [NUDGE_MARKER]]) {
      const r = decideStaleDraft({
        pr: draft(),
        lastPushAt: ago(PROMOTE_AFTER_MS),
        comments,
        now: NOW,
      });
      assert.equal(r.action, 'promote');
    }
  });

  it('fails closed on unknown or invalid push time', () => {
    for (const lastPushAt of [null, undefined, 'garbage']) {
      assert.equal(
        decideStaleDraft({ pr: draft(), lastPushAt, now: NOW }).action,
        'skip',
      );
    }
  });
});
