import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findLatestLabelActor,
  listPrReviewsFresh,
  findHumanMaintainerApproval,
} from '../github.mjs';

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

describe('listPrReviewsFresh', () => {
  it('maps REST review objects to the normalized shape', () => {
    const exec = () =>
      JSON.stringify([
        { user: { login: 'alice', type: 'User' }, state: 'APPROVED' },
        {
          user: { login: 'legacy-sports-review-bot[bot]', type: 'Bot' },
          state: 'CHANGES_REQUESTED',
        },
      ]);
    assert.deepStrictEqual(listPrReviewsFresh(1, exec), [
      { userLogin: 'alice', userType: 'User', state: 'APPROVED' },
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        userType: 'Bot',
        state: 'CHANGES_REQUESTED',
      },
    ]);
  });

  it('handles paginated multi-page output and missing user', () => {
    const exec = () =>
      [
        JSON.stringify([
          { user: { login: 'a', type: 'User' }, state: 'APPROVED' },
        ]),
        JSON.stringify([{ user: null, state: 'DISMISSED' }]),
      ].join('\n');
    assert.deepStrictEqual(listPrReviewsFresh(1, exec), [
      { userLogin: 'a', userType: 'User', state: 'APPROVED' },
      { userLogin: null, userType: null, state: 'DISMISSED' },
    ]);
  });
});

describe('findHumanMaintainerApproval', () => {
  const allow = (logins) => (login) => logins.includes(login);

  it('returns the login of a human maintainer with a live APPROVED review', () => {
    const reviews = [
      { userLogin: 'alice', userType: 'User', state: 'APPROVED' },
    ];
    assert.strictEqual(
      findHumanMaintainerApproval(reviews, allow(['alice'])),
      'alice',
    );
  });

  it('ignores bot approvals by user type and by [bot] login suffix', () => {
    const reviews = [
      { userLogin: 'some-bot[bot]', state: 'APPROVED' },
      { userLogin: 'other-bot', userType: 'Bot', state: 'APPROVED' },
    ];
    assert.strictEqual(
      findHumanMaintainerApproval(reviews, () => true),
      null,
    );
  });

  it('ignores dismissed and changes-requested reviews', () => {
    const reviews = [
      { userLogin: 'alice', userType: 'User', state: 'DISMISSED' },
      { userLogin: 'alice', userType: 'User', state: 'CHANGES_REQUESTED' },
      { userLogin: 'alice', userType: 'User', state: 'COMMENTED' },
    ];
    assert.strictEqual(
      findHumanMaintainerApproval(reviews, allow(['alice'])),
      null,
    );
  });

  it('ignores human approvals without maintainer permission', () => {
    const reviews = [
      { userLogin: 'drive-by', userType: 'User', state: 'APPROVED' },
      { userLogin: 'owner', userType: 'User', state: 'APPROVED' },
    ];
    assert.strictEqual(
      findHumanMaintainerApproval(reviews, allow(['owner'])),
      'owner',
    );
  });

  it('checks each candidate login only once (deduplicates re-approvals)', () => {
    const seen = [];
    const reviews = [
      { userLogin: 'alice', userType: 'User', state: 'APPROVED' },
      { userLogin: 'alice', userType: 'User', state: 'APPROVED' },
    ];
    const check = (login) => {
      seen.push(login);
      return false;
    };
    assert.strictEqual(findHumanMaintainerApproval(reviews, check), null);
    assert.deepStrictEqual(seen, ['alice']);
  });

  it('handles GraphQL-shaped reviews with no userType field', () => {
    const reviews = [{ userLogin: 'alice', state: 'APPROVED' }];
    assert.strictEqual(
      findHumanMaintainerApproval(reviews, allow(['alice'])),
      'alice',
    );
  });
});
