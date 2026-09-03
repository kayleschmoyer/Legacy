/**
 * Unit tests — LS-9523: the scheduled/EventBridge auto-pick path
 * (predictAutoPick / runAutoPickLockedTransaction) must thread the draft's
 * actual `league.sport` through to `getUnfilledPositionTypes` and
 * `selectAutoPickPlayer` instead of relying on their 'baseball' defaults.
 *
 * Before this fix, neither call site passed `sport`, so every scheduled
 * auto-pick for a football draft silently scored candidates against the
 * baseball position map and fell through to the bench/fallback path.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/db-client', () => ({
  PublicSchema: {
    leagues: { id: 'leagues.id', draftStatus: 'leagues.draft_status' },
    teamMembers: {
      teamId: 'team_members.team_id',
      leagueId: 'team_members.league_id',
    },
    draftTeams: {
      draftId: 'draft_teams.draft_id',
      teamId: 'draft_teams.team_id',
    },
    drafts: { id: 'drafts.id' },
  },
}));

const getCurrentDraftPickInfoMock = jest.fn();
const getUnfilledPositionTypesMock = jest.fn().mockResolvedValue([]);
const commitDraftPickMock = jest.fn();
const enableAutoPickForUnmanagedTeamsMock = jest
  .fn()
  .mockResolvedValue(undefined);

jest.mock('./helpers', () => ({
  getCurrentDraftPickInfo: (...args: unknown[]) =>
    getCurrentDraftPickInfoMock(...args),
  getUnfilledPositionTypes: (...args: unknown[]) =>
    getUnfilledPositionTypesMock(...args),
  commitDraftPick: (...args: unknown[]) => commitDraftPickMock(...args),
  enableAutoPickForUnmanagedTeams: (...args: unknown[]) =>
    enableAutoPickForUnmanagedTeamsMock(...args),
}));

const selectAutoPickPlayerMock = jest
  .fn()
  .mockResolvedValue({ playerId: 1, reason: 'test pick' });
const guardConcurrentPickMock = jest.fn();

jest.mock('./auto-pick-scorer', () => ({
  selectAutoPickPlayer: (...args: unknown[]) =>
    selectAutoPickPlayerMock(...args),
  guardConcurrentPick: (...args: unknown[]) => guardConcurrentPickMock(...args),
}));

jest.mock('./candidate-pool', () => ({}));
jest.mock('./draft-pick-effects', () => ({}));

jest.mock('../builder', () => ({
  builder: {
    objectRef: jest.fn(() => ({})),
    objectType: jest.fn(),
    mutationField: jest.fn(),
  },
}));

jest.mock('../graphql-errors', () => ({
  AuthenticationError: jest.fn(),
  ForbiddenError: jest.fn(),
}));

jest.mock('../leagues/delete-resilience', () => ({
  describeDbError: jest.fn(() => ({})),
  formatDbError: jest.fn(),
}));

import {
  predictAutoPick,
  runAutoPickLockedTransaction,
} from './scheduled-mutations';
import type { CandidatePool } from './candidate-pool';

function makeFootballCandidatePool(): CandidatePool {
  return {
    eligibleIds: [1, 2],
    playerDraftInfo: new Map(),
    rankedEligibleIds: [1, 2],
    bestBenchPick: undefined,
    league: {
      id: 10,
      sport: 'football',
      maxRosterSize: 25,
    } as unknown as CandidatePool['league'],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('predictAutoPick — sport threading (LS-9523)', () => {
  it('passes the football league sport to getUnfilledPositionTypes and selectAutoPickPlayer', async () => {
    getCurrentDraftPickInfoMock.mockResolvedValue({
      teamId: 5,
      overallPick: 1,
      isComplete: false,
    });

    const candidatePool = makeFootballCandidatePool();
    const db = {} as never;

    const result = await predictAutoPick(db, 100, 10, candidatePool);

    expect(getUnfilledPositionTypesMock).toHaveBeenCalledWith(
      db,
      100,
      5,
      10,
      'football',
    );
    expect(selectAutoPickPlayerMock).toHaveBeenCalledWith(
      expect.objectContaining({ sport: 'football' }),
    );
    expect(result).not.toBeNull();
  });
});

describe('runAutoPickLockedTransaction — sport threading (LS-9523)', () => {
  it('passes the football league sport through the in-lock fallback recomputation', async () => {
    getCurrentDraftPickInfoMock.mockResolvedValue({
      teamId: 5,
      overallPick: 1,
      isComplete: false,
    });
    commitDraftPickMock.mockResolvedValue({
      draftPick: {},
      isDraftComplete: true,
      nextDeadline: null,
      nextPickInfo: null,
      now: new Date(),
    });

    let executeCall = 0;
    const execute = jest.fn(async () => {
      executeCall += 1;
      if (executeCall === 1) return { rows: [] }; // SET LOCAL statement_timeout
      if (executeCall === 2) {
        return {
          rows: [
            {
              id: 100,
              league_id: 10,
              current_pick: 1,
              current_pick_deadline: new Date(Date.now() - 1000),
            },
          ],
        };
      }
      throw new Error(`Unexpected tx.execute call #${executeCall}`);
    });

    let selectCall = 0;
    const select = jest.fn(() => {
      selectCall += 1;
      const thisCall = selectCall;
      const result = (): unknown => {
        if (thisCall === 1) {
          // txLeague re-validation
          return [{ id: 10, draftStatus: 'in-progress', sport: 'football' }];
        }
        if (thisCall === 2) {
          // roster count check
          return [{ count: 0 }];
        }
        throw new Error(`Unexpected tx.select call #${thisCall}`);
      };
      // Thenable chain — mirrors drizzle's fluent builder, resolving
      // regardless of whether the real call site ends the chain with
      // `.limit()` (txLeague) or `.where()` (the roster count check, which
      // has no `.limit()`).
      const chain: Record<string, unknown> = {};
      chain.from = jest.fn(() => chain);
      chain.where = jest.fn(() => chain);
      chain.limit = jest.fn(() => chain);
      chain.then = (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve(result()).then(resolve, reject);
      return chain;
    });

    const tx = { execute, select };
    const db = { transaction: (cb: (tx: unknown) => unknown) => cb(tx) };

    const candidatePool = makeFootballCandidatePool();

    const pickResult = await runAutoPickLockedTransaction({
      db: db as never,
      draftId: 100,
      draftLeagueId: 10,
      pickTimeLimitSeconds: 60,
      candidatePool,
      predicted: null, // forces the full in-lock recomputation branch
    });

    expect(pickResult).not.toBeNull();
    expect(getUnfilledPositionTypesMock).toHaveBeenCalledWith(
      tx,
      100,
      5,
      10,
      'football',
    );
    expect(selectAutoPickPlayerMock).toHaveBeenCalledWith(
      expect.objectContaining({ sport: 'football' }),
    );
  });
});
