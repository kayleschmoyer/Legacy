/**
 * Unit tests for conflict-sweep-decision.mjs.
 *
 * These guard the base-push sweep's write decision, most importantly the
 * false-green regression that started the LS merge-conflict-status fix chain:
 * when main advances and introduces a conflict, a PR whose recorded "No Merge
 * Conflicts" run is a stale `completed:success` MUST be re-POSTed as a failure,
 * never silently skipped.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { decideSweepAction } from '../conflict-sweep-decision.mjs';

describe('decideSweepAction', () => {
  it('skips when the recorded run already matches (success)', () => {
    assert.equal(
      decideSweepAction('success', 'completed', 'success'),
      'in-sync',
    );
  });

  it('skips when the recorded run already matches (failure)', () => {
    assert.equal(
      decideSweepAction('failure', 'completed', 'failure'),
      'in-sync',
    );
  });

  it('POSTs when a conflict appears under a stale completed:success (the regression)', () => {
    // main advanced and now conflicts, but the required check is still green.
    assert.equal(decideSweepAction('failure', 'completed', 'success'), 'post');
  });

  it('POSTs when a conflict is resolved under a stale completed:failure', () => {
    assert.equal(decideSweepAction('success', 'completed', 'failure'), 'post');
  });

  it('POSTs when no run exists yet (absent)', () => {
    assert.equal(decideSweepAction('failure', 'absent', ''), 'post');
  });

  it('POSTs (fail-open) when the recorded lookup returned an unknown/empty status', () => {
    assert.equal(decideSweepAction('failure', '', ''), 'post');
  });

  it('defers to a live in_progress run instead of racing it', () => {
    assert.equal(
      decideSweepAction('failure', 'in_progress', ''),
      'defer-to-live',
    );
  });

  it('defers to a live queued run', () => {
    assert.equal(decideSweepAction('success', 'queued', ''), 'defer-to-live');
  });

  it('does not treat a completed run with a different conclusion as in-sync', () => {
    // Guards against ever collapsing a mismatched completed run into a skip.
    assert.notEqual(
      decideSweepAction('failure', 'completed', 'success'),
      'in-sync',
    );
  });

  it('rejects an invalid fresh conclusion rather than guessing', () => {
    assert.throws(() => decideSweepAction('unknown', 'completed', 'success'));
  });
});
