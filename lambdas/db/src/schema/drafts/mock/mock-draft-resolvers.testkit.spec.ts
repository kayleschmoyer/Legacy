/**
 * Guards the mock-draft resolver test kit (LS-10076) in the unit suite.
 *
 * `mock-draft.db.spec.ts` only runs against real Postgres in CI's DB
 * Integration Tests, and pc-typecheck/pc-test never load it (LS-10193). When
 * the kit's builder stub stopped covering a builder method used somewhere in
 * the modules it imports, every DB spec failed on import and nothing local
 * caught it. Capturing needs no database, so it is checked here.
 */

import { captureMockDraftResolvers } from './mock-draft-resolvers.testkit';

describe('captureMockDraftResolvers', () => {
  it('imports the mock-draft modules and captures every resolver', async () => {
    const resolvers = await captureMockDraftResolvers();

    const expected = [
      'createMockDraft',
      'joinMockDraft',
      'startMockDraft',
      'leaveMockDraft',
      'kickMockDraftSeat',
      'updateMockDraftLobby',
      'deleteMockDraft',
      'deleteMyMockDrafts',
      'draftRoom',
      'draftMessages',
      'sendDraftMessage',
      'expireMockDraftLobbies',
      'purgeStaleOfflineMockDrafts',
      'getMyMockDraftUsage',
      'myActiveMockDrafts',
    ] as const;

    for (const name of expected) {
      expect({ name, type: typeof resolvers[name] }).toEqual({
        name,
        type: 'function',
      });
    }
  });
});
