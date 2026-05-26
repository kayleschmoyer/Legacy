import { getFootballEligiblePositions } from './football-eligible-positions';

describe('getFootballEligiblePositions', () => {
  // Branch 1: DST players
  describe('Branch 1 — is_dst = true → DST', () => {
    it('returns DST for a DST player regardless of position', () => {
      expect(
        getFootballEligiblePositions(
          { isDst: true, position: null },
          null,
          null,
        ),
      ).toEqual(['DST']);
    });

    it('returns DST even when position is set (is_dst takes priority)', () => {
      expect(
        getFootballEligiblePositions(
          { isDst: true, position: 'DL' },
          null,
          null,
        ),
      ).toEqual(['DST']);
    });

    it('returns DST even with career stats present', () => {
      expect(
        getFootballEligiblePositions(
          { isDst: true, position: null },
          { att: 100 },
          { fga: 20 },
        ),
      ).toEqual(['DST']);
    });
  });

  // Branch 2: IDP positions
  describe('Branch 2 — IDP position (DL / LB / DB)', () => {
    it.each([['DL'], ['LB'], ['DB']] as const)(
      'returns [%s] for an IDP player with position %s',
      (pos) => {
        expect(
          getFootballEligiblePositions(
            { isDst: false, position: pos },
            null,
            null,
          ),
        ).toEqual([pos]);
      },
    );

    it('does not return IDP position when is_dst is true', () => {
      expect(
        getFootballEligiblePositions(
          { isDst: true, position: 'DL' },
          null,
          null,
        ),
      ).toEqual(['DST']);
    });
  });

  // Branch 3: Offensive positions
  describe('Branch 3 — offensive position (QB / RB / WR / TE / K)', () => {
    it.each([['QB'], ['RB'], ['WR'], ['TE'], ['K']] as const)(
      'returns [%s] for a player with position %s',
      (pos) => {
        expect(
          getFootballEligiblePositions(
            { isDst: false, position: pos },
            null,
            null,
          ),
        ).toEqual([pos]);
      },
    );

    it('returns K from position column (not stat-inferred) when position = K', () => {
      expect(
        getFootballEligiblePositions({ isDst: false, position: 'K' }, null, {
          fga: 30,
        }),
      ).toEqual(['K']);
    });
  });

  // Branch 4: QB stat-inferred
  describe('Branch 4 — QB stat-inferred (position IS NULL, passing att > 0)', () => {
    it('returns QB when position is null and has passing attempts', () => {
      expect(
        getFootballEligiblePositions(
          { isDst: false, position: null },
          { att: 1 },
          null,
        ),
      ).toEqual(['QB']);
    });

    it('returns QB even when kicking stats are also present', () => {
      expect(
        getFootballEligiblePositions(
          { isDst: false, position: null },
          { att: 10 },
          { fga: 5 },
        ),
      ).toEqual(['QB']);
    });

    it('does not infer QB when att = 0', () => {
      expect(
        getFootballEligiblePositions(
          { isDst: false, position: null },
          { att: 0 },
          null,
        ),
      ).toEqual([]);
    });

    it('does not infer QB when careerPassing is null', () => {
      expect(
        getFootballEligiblePositions(
          { isDst: false, position: null },
          null,
          null,
        ),
      ).toEqual([]);
    });

    it('does not infer QB when position is already set', () => {
      expect(
        getFootballEligiblePositions(
          { isDst: false, position: 'WR' },
          { att: 5 },
          null,
        ),
      ).toEqual(['WR']);
    });
  });

  // Branch 5: K stat-inferred
  describe('Branch 5 — K stat-inferred (position IS NULL, fga > 0, no passing att)', () => {
    it('returns K when position is null, has FG attempts, no passing attempts', () => {
      expect(
        getFootballEligiblePositions({ isDst: false, position: null }, null, {
          fga: 1,
        }),
      ).toEqual(['K']);
    });

    it('does NOT return K when there are also passing attempts (QB wins)', () => {
      expect(
        getFootballEligiblePositions(
          { isDst: false, position: null },
          { att: 10 },
          { fga: 3 },
        ),
      ).toEqual(['QB']);
    });

    it('does not infer K when fga = 0', () => {
      expect(
        getFootballEligiblePositions({ isDst: false, position: null }, null, {
          fga: 0,
        }),
      ).toEqual([]);
    });

    it('does not infer K when careerKicking is null', () => {
      expect(
        getFootballEligiblePositions(
          { isDst: false, position: null },
          null,
          null,
        ),
      ).toEqual([]);
    });

    it('does not infer K when position is already set', () => {
      expect(
        getFootballEligiblePositions({ isDst: false, position: 'RB' }, null, {
          fga: 2,
        }),
      ).toEqual(['RB']);
    });

    it('does not infer K even with passing att = 0 (zero att guard)', () => {
      // att = 0 counts as no passing attempts — K should win
      expect(
        getFootballEligiblePositions(
          { isDst: false, position: null },
          { att: 0 },
          { fga: 5 },
        ),
      ).toEqual(['K']);
    });
  });

  // No eligible positions
  describe('No eligible positions', () => {
    it('returns empty array for a non-DST player with no position and no career stats', () => {
      expect(
        getFootballEligiblePositions(
          { isDst: false, position: null },
          null,
          null,
        ),
      ).toEqual([]);
    });
  });
});
