import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findLatestLabelActor } from '../github.mjs';

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
