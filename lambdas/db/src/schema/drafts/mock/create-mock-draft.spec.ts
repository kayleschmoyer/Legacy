/**
 * Input validation for `createMockDraft` (LS-6962, LS-6963). These checks run
 * before the resolver touches the database, so no Postgres is needed — the
 * `db` handle is a stub that fails the test if anything reaches it.
 */

import { MAX_MOCK_DRAFT_TEAMS } from '@legacy-sports/utils';

import {
  type CapturedMockDraftResolvers,
  captureMockDraftResolvers,
} from './mock-draft-resolvers.testkit';

describe('createMockDraft input validation', () => {
  let resolvers: CapturedMockDraftResolvers;

  const context = {
    db: new Proxy(
      {},
      {
        get() {
          throw new Error('validation should reject before any DB access');
        },
      },
    ),
    user: { id: 1, username: 'user_1', isAdmin: false },
    notificationService: null,
    isSystemRequest: false,
  };

  const create = (numTeams: number, pickPosition: number) =>
    resolvers.createMockDraft(
      {},
      { sport: 'baseball', numTeams, pickPosition, mode: 'offline' },
      context,
    );

  beforeAll(async () => {
    resolvers = await captureMockDraftResolvers();
  });

  it('rejects a below-range position with its own copy', async () => {
    await expect(create(10, -1)).rejects.toThrow(
      'Draft position must be at least 1 (got -1)',
    );
    await expect(create(10, 0)).rejects.toThrow(
      'Draft position must be at least 1 (got 0)',
    );
  });

  it('rejects an above-range position with distinct copy', async () => {
    await expect(create(12, 13)).rejects.toThrow(
      'Draft position 13 is past the last pick — a 12-team draft only has positions 1 to 12',
    );
  });

  it('caps numTeams at the shared MAX_MOCK_DRAFT_TEAMS', async () => {
    await expect(create(MAX_MOCK_DRAFT_TEAMS + 1, 1)).rejects.toThrow(
      `numTeams must be between 2 and ${String(MAX_MOCK_DRAFT_TEAMS)}`,
    );
  });
});
