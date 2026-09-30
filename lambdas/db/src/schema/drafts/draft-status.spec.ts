/**
 * Regression tests for setLeagueDraftStatus lock ordering (LS-10176).
 *
 * The `leagues_sync_draft_status` trigger updates `drafts` when `leagues`
 * changes, so every other writer locks league → draft. setLeagueDraftStatus
 * used to write the draft first (draft → league) and deadlocked against them
 * ("deadlock detected", Rollbar 263/264/270).
 */

import { PublicSchema } from '@legacy-sports/db-client';

import { setDraftStatus, setLeagueDraftStatus } from './draft-status';

function makeTx(leagueRowsUpdated: number) {
  const writes: string[] = [];
  const tx = {
    update: (table: unknown) => {
      const name = table === PublicSchema.leagues ? 'leagues' : 'drafts';
      writes.push(name);
      const chain = {
        set: () => chain,
        where: () => chain,
        returning: () =>
          Promise.resolve(
            Array.from({ length: leagueRowsUpdated }, () => ({ id: 1 })),
          ),
        then: (resolve: (value: unknown) => void) => resolve(undefined),
      };
      return chain;
    },
  };
  return { tx: tx as never, writes };
}

describe('setLeagueDraftStatus', () => {
  it('writes the league row before the draft row (matches the sync trigger lock order)', async () => {
    const { tx, writes } = makeTx(1);

    await setLeagueDraftStatus(tx, {
      draftId: 5,
      leagueId: 9,
      status: 'queued',
      expectedLeagueStatus: 'not-started',
    });

    expect(writes).toEqual(['leagues', 'drafts']);
  });

  it('leaves the draft untouched when the league compare-and-set loses', async () => {
    const { tx, writes } = makeTx(0);

    await setLeagueDraftStatus(tx, {
      draftId: 5,
      leagueId: 9,
      status: 'queued',
      expectedLeagueStatus: 'not-started',
    });

    expect(writes).toEqual(['leagues']);
  });

  it('writes both rows, league first, when there is no expected status', async () => {
    const { tx, writes } = makeTx(1);

    await setLeagueDraftStatus(tx, {
      draftId: 5,
      leagueId: 9,
      status: 'in-progress',
    });

    expect(writes).toEqual(['leagues', 'drafts']);
  });
});

describe('setDraftStatus', () => {
  it('delegates league drafts to the league-first ordering', async () => {
    const { tx, writes } = makeTx(1);

    await setDraftStatus(tx, {
      draftId: 5,
      leagueId: 9,
      status: 'in-progress',
    });

    expect(writes).toEqual(['leagues', 'drafts']);
  });

  it('writes only the draft for a mock draft', async () => {
    const { tx, writes } = makeTx(1);

    await setDraftStatus(tx, {
      draftId: 5,
      leagueId: null,
      status: 'in-progress',
    });

    expect(writes).toEqual(['drafts']);
  });
});
