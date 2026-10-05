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

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    PublicSchema: {
      leagues: { id: 'leagues.id', draftStatus: 'leagues.draft_status' },
      teamMembers: {
        teamId: 'team_members.team_id',
        leagueId: 'team_members.league_id',
      },
      drafts: { id: 'drafts.id' },
    },
  }),
);

const getSeatByIdMock = jest.fn().mockResolvedValue(null);

// The chaining check reads the next seat by its `draft_participants.id`
// (LS-10076) — a mock-draft seat has no team to look it up by.
jest.mock('./participants', () => ({
  getSeatById: (...args: unknown[]) => getSeatByIdMock(...args),
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
    // The pool carries DraftRules rather than a league row (LS-10076): the
    // sport, the roster and the eligibility settings all come from there, for
    // a league draft and a league-less mock draft alike.
    rules: {
      draftId: 100,
      kind: 'league',
      leagueId: 10,
      sport: 'football',
      maxRosterSize: 25,
      isMock: false,
      rosterPositions: ['QB', 'RB'],
    } as unknown as CandidatePool['rules'],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('predictAutoPick — sport threading (LS-9523)', () => {
  it('passes the football league sport to getUnfilledPositionTypes and selectAutoPickPlayer', async () => {
    getCurrentDraftPickInfoMock.mockResolvedValue({
      teamId: 5,
      participantId: 55,
      overallPick: 1,
      isComplete: false,
    });

    const candidatePool = makeFootballCandidatePool();
    const db = {} as never;

    const result = await predictAutoPick(db, 100, candidatePool);

    // Positional awareness routes through DraftRules rather than a leagueId +
    // sport pair (LS-10074 / LS-10086) — the rules carry the sport.
    expect(getUnfilledPositionTypesMock).toHaveBeenCalledWith(
      db,
      100,
      // Roster needs are keyed by seat, not team, since LS-10074.
      55,
      candidatePool.rules,
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
      participantId: 55,
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
              // The locked draft row now carries the status the transaction
              // re-validates against (LS-10074).
              status: 'in-progress',
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
          // roster count check — the league re-validation select is gone:
          // status now comes off the locked drafts row (LS-10074).
          return [{ count: 0 }];
        }
        throw new Error(`Unexpected tx.select call #${thisCall}`);
      };
      // Thenable chain — mirrors drizzle's fluent builder, resolving
      // regardless of whether the real call site ends the chain with
      // `.limit()` or `.where()` (the roster count check has no `.limit()`).
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
      // No draftLeagueId parameter since LS-10076 — the owning league (or
      // `null`) comes off the pool's rules.
      pickTimeLimitSeconds: 60,
      candidatePool,
      predicted: null, // forces the full in-lock recomputation branch
    });

    expect(pickResult).not.toBeNull();
    expect(getUnfilledPositionTypesMock).toHaveBeenCalledWith(
      tx,
      100,
      55,
      candidatePool.rules,
    );
    expect(selectAutoPickPlayerMock).toHaveBeenCalledWith(
      expect.objectContaining({ sport: 'football' }),
    );
  });
});
