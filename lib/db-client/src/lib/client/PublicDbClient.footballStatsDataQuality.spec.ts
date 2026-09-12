import { deriveFootballGameStatsDataQuality } from './PublicDbClient';

// LS-6394 (FMD-030): `getMatchupFootballPlayerGameStats` emits one entry per
// row in `matchup_player_games` — i.e. per *scheduled* game — and leaves the
// stat blocks null when no matching stat row exists. A null stat block scores
// 0, so before this discriminator existed a player whose stats were never
// ingested was indistinguishable from one who genuinely scored nothing, and
// the team total silently under-counted.
//
// There is no NFL game-status table in this schema (the ticket's suggested
// `nfl_games` join has no target), so `matchup_player_games.stats_loading_status`
// and `.no_game_data_found` — both written by the stats ingest lambda — are the
// only available "the game is done but we have nothing" signal.
describe('deriveFootballGameStatsDataQuality', () => {
  describe('when stat rows are present', () => {
    it.each([
      ['pending', false],
      ['completed', false],
      ['completed', true],
      ['failed', false],
      [null, false],
    ])(
      'reports ok regardless of ingest state (status=%s, noGameDataFound=%s)',
      (status, noGameDataFound) => {
        expect(
          deriveFootballGameStatsDataQuality(status, noGameDataFound, true),
        ).toBe('ok');
      },
    );
  });

  describe('when no stat rows are present', () => {
    it('reports stats_pending while the ingest has not completed', () => {
      expect(deriveFootballGameStatsDataQuality('pending', false, false)).toBe(
        'stats_pending',
      );
    });

    it('reports stats_failed when the ingest ran and failed', () => {
      expect(deriveFootballGameStatsDataQuality('failed', false, false)).toBe(
        'stats_failed',
      );
    });

    it('reports ok when the ingest explicitly recorded no game data — a real DNP zero', () => {
      expect(deriveFootballGameStatsDataQuality('completed', true, false)).toBe(
        'ok',
      );
    });

    // The bug this ticket was filed for: ingest claims success, does not flag
    // the game as having no data, and yet no stat row exists.
    it('reports stats_missing when a completed ingest left no row and no no-data flag', () => {
      expect(
        deriveFootballGameStatsDataQuality('completed', false, false),
      ).toBe('stats_missing');
    });

    it('reports stats_pending when no ingest status was recorded at all', () => {
      expect(deriveFootballGameStatsDataQuality(null, false, false)).toBe(
        'stats_pending',
      );
    });

    it('treats an unrecognized ingest status as not-yet-ingested rather than asserting the zero is real', () => {
      expect(
        deriveFootballGameStatsDataQuality('some_future_status', false, false),
      ).toBe('stats_pending');
    });

    // `failed` outranks the no-data flag: a failed ingest cannot be trusted to
    // have set `no_game_data_found` correctly in the first place.
    it('prefers stats_failed over the no-data flag when the ingest failed', () => {
      expect(deriveFootballGameStatsDataQuality('failed', true, false)).toBe(
        'stats_failed',
      );
    });
  });
});
