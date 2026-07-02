import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findLatestLabelActor, getCombinedStatusContexts } from '../github.mjs';

describe('findLatestLabelActor', () => {
  it('returns the actor login of the most recent labeled event for the given label', () => {
    const exec = () =>
      JSON.stringify([
        {
          event: 'labeled',
          label: { name: 'bot:reset-cycle-counter' },
          actor: { login: 'alice' },
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          event: 'labeled',
          label: { name: 'bot:reset-cycle-counter' },
          actor: { login: 'bob' },
          created_at: '2026-01-02T00:00:00Z',
        },
      ]);
    assert.strictEqual(
      findLatestLabelActor(42, 'bot:reset-cycle-counter', exec),
      'bob',
    );
  });

  it('ignores labeled events for other labels', () => {
    const exec = () =>
      JSON.stringify([
        {
          event: 'labeled',
          label: { name: 'merge-when-ready' },
          actor: { login: 'alice' },
        },
        {
          event: 'labeled',
          label: { name: 'bot:reset-cycle-counter' },
          actor: { login: 'bob' },
        },
      ]);
    assert.strictEqual(
      findLatestLabelActor(7, 'bot:reset-cycle-counter', exec),
      'bob',
    );
  });

  it('ignores non-labeled events (unlabeled, commented, etc.)', () => {
    const exec = () =>
      JSON.stringify([
        {
          event: 'unlabeled',
          label: { name: 'bot:reset-cycle-counter' },
          actor: { login: 'alice' },
        },
        {
          event: 'commented',
          actor: { login: 'eve' },
        },
      ]);
    assert.strictEqual(
      findLatestLabelActor(1, 'bot:reset-cycle-counter', exec),
      '',
    );
  });

  it('returns empty string when the label was never applied', () => {
    const exec = () => JSON.stringify([]);
    assert.strictEqual(
      findLatestLabelActor(1, 'bot:reset-cycle-counter', exec),
      '',
    );
  });

  it('handles paginated multi-page output (gh --paginate concatenates JSON arrays)', () => {
    const exec = () =>
      [
        JSON.stringify([
          {
            event: 'labeled',
            label: { name: 'bot:reset-cycle-counter' },
            actor: { login: 'alice' },
          },
        ]),
        JSON.stringify([
          {
            event: 'labeled',
            label: { name: 'bot:reset-cycle-counter' },
            actor: { login: 'bob' },
          },
        ]),
      ].join('\n');
    assert.strictEqual(
      findLatestLabelActor(1, 'bot:reset-cycle-counter', exec),
      'bob',
    );
  });

  it('returns empty string and does not throw when the API call fails', () => {
    const exec = () => {
      throw new Error('gh api failed');
    };
    assert.strictEqual(
      findLatestLabelActor(1, 'bot:reset-cycle-counter', exec),
      '',
    );
  });

  it('returns empty string when actor is missing', () => {
    const exec = () =>
      JSON.stringify([
        {
          event: 'labeled',
          label: { name: 'bot:reset-cycle-counter' },
          actor: null,
        },
      ]);
    assert.strictEqual(
      findLatestLabelActor(1, 'bot:reset-cycle-counter', exec),
      '',
    );
  });
});

describe('getCombinedStatusContexts (LS-8289)', () => {
  const SHA = 'abc123def456abc123def456abc123def456abc1';

  it('returns {context, state} pairs from the combined status endpoint', () => {
    const exec = (cmd, args) => {
      assert.strictEqual(cmd, 'gh');
      assert.ok(args.includes(`repos/{owner}/{repo}/commits/${SHA}/status`));
      return JSON.stringify({
        state: 'pending',
        statuses: [
          { context: 'bot-review', state: 'success', extra: 'ignored' },
          { context: 'CI Gate', state: 'pending' },
        ],
      });
    };
    assert.deepStrictEqual(getCombinedStatusContexts(SHA, exec), [
      { context: 'bot-review', state: 'success' },
      { context: 'CI Gate', state: 'pending' },
    ]);
  });

  it('returns [] when the SHA has no statuses', () => {
    const exec = () => JSON.stringify({ state: 'pending', statuses: [] });
    assert.deepStrictEqual(getCombinedStatusContexts(SHA, exec), []);
  });

  it('returns [] on API errors so callers run a review rather than skip one', () => {
    const exec = () => {
      throw new Error('gh: HTTP 500');
    };
    assert.deepStrictEqual(getCombinedStatusContexts(SHA, exec), []);
  });

  it('returns [] on malformed payloads', () => {
    const exec = () => 'not json';
    assert.deepStrictEqual(getCombinedStatusContexts(SHA, exec), []);
  });
});
