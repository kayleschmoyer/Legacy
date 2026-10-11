import {
  accumulateBoxScore,
  createAccumulator,
  type PfaCrosswalkRow,
} from '@legacy-sports/pfa-client';
import {
  collectObservedSeasons,
  resolvePfaIngestIdentities,
} from './ingestPfaFootball';

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({ runWithPublicClient: jest.fn() }),
);

function crosswalkRow(
  overrides: Partial<PfaCrosswalkRow> & Pick<PfaCrosswalkRow, 'pfaId'>,
): PfaCrosswalkRow {
  return {
    pfaName: 'Some Player',
    pfaCollege: null,
    pfaLeague: 'nfl',
    playerId: null,
    confidence: 0,
    matchMethod: 'no_match',
    candidateCount: 0,
    matchedFinalSeason: null,
    ...overrides,
  };
}

describe('resolvePfaIngestIdentities (ADR 0023 corpus key)', () => {
  it('keys a name-matched PFR player by pfr_id', () => {
    const { resolved } = resolvePfaIngestIdentities(
      [
        crosswalkRow({
          pfaId: 'mari00100',
          playerId: 1,
          matchMethod: 'exact_name_unique',
        }),
      ],
      new Map([[1, { pfrId: 'MariDa00', pfaId: null }]]),
    );

    expect(resolved.get('mari00100')).toEqual({
      playerId: 1,
      pfrId: 'MariDa00',
      corpusKey: 'MariDa00',
    });
  });

  it('keys a PFA-only player by pfa-<pfaId> via its own pfa_id, even when the name crosswalk found nothing', () => {
    const { resolved } = resolvePfaIngestIdentities(
      [
        crosswalkRow({
          pfaId: 'unit00100',
          matchMethod: 'ambiguous_unresolved',
        }),
      ],
      new Map([[2, { pfrId: null, pfaId: 'unit00100' }]]),
    );

    expect(resolved.get('unit00100')).toEqual({
      playerId: 2,
      pfrId: null,
      corpusKey: 'pfa-unit00100',
    });
  });

  it('rejects a name match onto a row owned by a different pfa_id', () => {
    const resolution = resolvePfaIngestIdentities(
      [
        crosswalkRow({
          pfaId: 'smit00200',
          playerId: 3,
          matchMethod: 'exact_name_unique',
        }),
      ],
      new Map([[3, { pfrId: null, pfaId: 'smit00100' }]]),
    );

    expect(resolution.resolved.size).toBe(0);
    expect(resolution.pfaIdConflict).toBe(1);
  });

  it('counts unmatched entries and rows with no corpus key, never inventing one', () => {
    const resolution = resolvePfaIngestIdentities(
      [
        crosswalkRow({ pfaId: 'nobo00100' }),
        crosswalkRow({
          pfaId: 'keyl00100',
          playerId: 4,
          matchMethod: 'exact_name_unique',
        }),
      ],
      new Map([[4, { pfrId: null, pfaId: null }]]),
    );

    expect(resolution.resolved.size).toBe(0);
    expect(resolution.unresolved).toBe(1);
    expect(resolution.noCorpusKey).toBe(1);
  });
});

describe('collectObservedSeasons (LS-11064)', () => {
  it('merges box-score stat seasons with kicker scoring-play seasons per pfaId', () => {
    const acc = createAccumulator();
    accumulateBoxScore(acc, {
      gameIdentifier: '1965nfl001',
      season: 1965,
      players: [
        {
          pfaId: 'rb000100',
          name: 'Some Back',
          rushing: { att: 5, yds: 20, avg: 4, lng: 8, lngTd: false, td: 0 },
          passing: null,
          receiving: null,
          interceptions: null,
          punting: null,
          puntReturns: null,
          kickoffReturns: null,
        },
      ],
      scoringPlays: [],
      quarterScores: null,
    });

    const observed = collectObservedSeasons(
      acc,
      new Map([
        [1965, new Set(['clar08000', 'rb000100'])],
        [1966, new Set(['clar08000'])],
      ]),
    );

    expect(observed.get('rb000100')).toEqual(new Set([1965]));
    expect(observed.get('clar08000')).toEqual(new Set([1965, 1966]));
  });
});
