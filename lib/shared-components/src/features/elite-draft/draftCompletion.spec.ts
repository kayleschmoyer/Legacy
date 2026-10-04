import {
  getDraftCompletionActions,
  MOCK_DRAFT_SETUP_PATH,
  resolveDraftedPlayers,
} from './draftCompletion';
import type { DraftPickRecord, DraftPlayer } from './types';

const pathsOf = (actions: ReturnType<typeof getDraftCompletionActions>) =>
  actions.map((a) => [a.key, a.path, a.primary]);

describe('getDraftCompletionActions (LS-10528)', () => {
  it.each(['baseball', 'football'] as const)(
    'routes a %s mock draft to the mock setup page and the sport home',
    (sport) => {
      expect(
        pathsOf(
          getDraftCompletionActions({ sport, isMockDraft: true, leagueId: 9 }),
        ),
      ).toEqual([
        ['practice-again', MOCK_DRAFT_SETUP_PATH, true],
        ['my-leagues', `/${sport}`, false],
      ]);
    },
  );

  it.each(['baseball', 'football'] as const)(
    'routes a %s league draft to that sport league roster and home',
    (sport) => {
      expect(
        pathsOf(
          getDraftCompletionActions({ sport, isMockDraft: false, leagueId: 9 }),
        ),
      ).toEqual([
        ['set-lineup', `/${sport}/league/9/roster`, true],
        ['back-to-league', `/${sport}/league/9`, false],
      ]);
    },
  );

  it('falls back to the sport home when a league draft has no league id', () => {
    expect(
      pathsOf(
        getDraftCompletionActions({
          sport: 'football',
          isMockDraft: false,
          leagueId: null,
        }),
      ),
    ).toEqual([['my-leagues', '/football', true]]);
  });
});

describe('resolveDraftedPlayers', () => {
  const pick = (
    playerId: number,
    extra: Partial<DraftPickRecord> = {},
  ): DraftPickRecord => ({
    id: String(playerId),
    draftId: 1,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    pickedAt: '2026-08-01T00:00:00Z',
    teamId: 2,
    playerId,
    ...extra,
  });

  it('prefers the stats lookup and placeholders missing players', () => {
    const known: DraftPlayer = {
      id: 1,
      name: 'Known',
      position: 'SS',
      avg: 0,
      hr: 0,
      rbi: 0,
      runs: 0,
      sb: 0,
      games: 0,
      hits: 0,
      obp: 0,
      slg: 0,
    };
    const resolved = resolveDraftedPlayers(
      [
        pick(1),
        pick(2, { player: { id: 2, firstName: 'Ann', lastName: 'Bee' } }),
        pick(3),
      ],
      new Map([[1, known]]),
    );
    expect(resolved.map((p) => p.name)).toEqual([
      'Known',
      'Ann Bee',
      'Unknown Player (ID: 3)',
    ]);
    expect(resolved[2].position).toBe('UTIL');
  });
});
