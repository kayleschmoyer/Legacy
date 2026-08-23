import {
  camelCaseScoringMultipliers,
  getCamelCaseScoringMultipliersForLeague,
} from './PublicDbClient';
import type { LeagueScoringMultipliers } from '../../types/ScoringTypes';

// The scoring stat definitions key their multipliers by source_column, which is
// snake_case. The scoring engine looks weights up against camelCase aggregate
// keys, so every scoring caller must convert first (LS-9532).
const RAW_MULTIPLIERS: LeagueScoringMultipliers = {
  batting: { h: 1, hr: 4, doubles: 2 },
  pitching: { outs_recorded: 1, so: 1, er: -2 },
  fielding: { e_def: -0.5, dp_def: 0.5, po: 0.02 },
};

describe('camelCaseScoringMultipliers', () => {
  it('re-keys multi-word source columns to camelCase', () => {
    const converted = camelCaseScoringMultipliers(RAW_MULTIPLIERS);

    expect(converted.pitching).toEqual({ outsRecorded: 1, so: 1, er: -2 });
    expect(converted.fielding).toEqual({ eDef: -0.5, dpDef: 0.5, po: 0.02 });
  });

  it('leaves single-word keys and values untouched', () => {
    const converted = camelCaseScoringMultipliers(RAW_MULTIPLIERS);

    expect(converted.batting).toEqual({ h: 1, hr: 4, doubles: 2 });
  });

  it('does not mutate the input', () => {
    camelCaseScoringMultipliers(RAW_MULTIPLIERS);

    expect(RAW_MULTIPLIERS.pitching).toEqual({
      outs_recorded: 1,
      so: 1,
      er: -2,
    });
  });

  it('converts the optional football groups when present', () => {
    const converted = camelCaseScoringMultipliers({
      ...RAW_MULTIPLIERS,
      passing: { pass_yds: 0.04, pass_td: 4 },
    });

    expect(converted.passing).toEqual({ passYds: 0.04, passTd: 4 });
  });

  it('omits optional groups that were absent', () => {
    const converted = camelCaseScoringMultipliers(RAW_MULTIPLIERS);

    expect(converted.passing).toBeUndefined();
    expect(converted.idp).toBeUndefined();
  });
});

describe('getCamelCaseScoringMultipliersForLeague', () => {
  it('returns the league multipliers already re-keyed for the scoring engine', async () => {
    // getScoringMultipliersForLeague issues a plain `select().from()` for the
    // stat definitions, then resolves via the thenable chain.
    const definitions = [
      {
        id: 1,
        statGroup: 'pitching',
        sourceColumn: 'outs_recorded',
        defaultMultiplier: '1',
      },
      {
        id: 2,
        statGroup: 'fielding',
        sourceColumn: 'e_def',
        defaultMultiplier: '-0.5',
      },
      {
        id: 3,
        statGroup: 'batting',
        sourceColumn: 'h',
        defaultMultiplier: '1',
      },
    ];

    const chain = {
      select: jest.fn(),
      from: jest.fn().mockResolvedValue(definitions),
    };
    chain.select.mockReturnValue(chain);

    const multipliers = await getCamelCaseScoringMultipliersForLeague(
      chain as never,
      null,
    );

    expect(multipliers).toEqual({
      batting: { h: 1 },
      pitching: { outsRecorded: 1 },
      fielding: { eDef: -0.5 },
    });
  });
});
