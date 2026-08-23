import {
  camelCaseScoringMultipliers,
  getCamelCaseScoringMultipliersForLeague,
  getScoringMultipliersForLeague,
  type PublicDb,
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

// ── Football stat groups (LS-9664) ──────────────────────────────────────────
//
// `scoring_stat_definitions` carries 35 football rows across six stat groups.
// `assignMultiplier` used to switch on batting/pitching/fielding only, so every
// football definition fell through and was silently discarded — a league could
// configure football scoring and get nothing back.

/**
 * Minimal stand-in for the Drizzle query-builder chain used by
 * `getScoringMultipliersForLeague`, which issues up to three reads in order:
 * stat definitions, the league's default profile, then that profile's entries.
 * Each queued result set is handed out in call order.
 */
function mockDb(...resultSets: Record<string, unknown>[][]): PublicDb {
  let call = 0;
  const chain: Record<string, unknown> = {};

  chain['select'] = jest.fn(() => chain);
  chain['from'] = jest.fn(() => {
    const rows = resultSets[call++] ?? [];
    const node: Record<string, unknown> = {};
    node['where'] = jest.fn(() => node);
    node['limit'] = jest.fn(() => node);
    node['then'] = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(onFulfilled, onRejected);
    return node;
  });

  return chain as unknown as PublicDb;
}

const BASEBALL_DEFINITIONS = [
  { id: 1, statGroup: 'batting', sourceColumn: 'hr', defaultMultiplier: '4' },
  {
    id: 2,
    statGroup: 'pitching',
    sourceColumn: 'outs_recorded',
    defaultMultiplier: '1',
  },
  {
    id: 3,
    statGroup: 'fielding',
    sourceColumn: 'e_def',
    defaultMultiplier: '-0.5',
  },
];

// One definition per football group, mirroring the real source_column values.
const FOOTBALL_DEFINITIONS = [
  { id: 10, statGroup: 'passing', sourceColumn: 'td', defaultMultiplier: '4' },
  {
    id: 11,
    statGroup: 'rushing',
    sourceColumn: 'yds',
    defaultMultiplier: '0.1',
  },
  {
    id: 12,
    statGroup: 'receiving',
    sourceColumn: 'rec',
    defaultMultiplier: '1',
  },
  { id: 13, statGroup: 'kicking', sourceColumn: 'fgm', defaultMultiplier: '3' },
  {
    id: 14,
    statGroup: 'defense',
    sourceColumn: 'pts_band_0',
    defaultMultiplier: '10',
  },
  {
    id: 15,
    statGroup: 'idp',
    sourceColumn: 'solo_tkl',
    defaultMultiplier: '1',
  },
];

describe('getScoringMultipliersForLeague — football stat groups', () => {
  it('populates every football group from the stat definitions', async () => {
    const multipliers = await getScoringMultipliersForLeague(
      mockDb([...BASEBALL_DEFINITIONS, ...FOOTBALL_DEFINITIONS]),
      null,
    );

    expect(multipliers.passing).toEqual({ td: 4 });
    expect(multipliers.rushing).toEqual({ yds: 0.1 });
    expect(multipliers.receiving).toEqual({ rec: 1 });
    expect(multipliers.kicking).toEqual({ fgm: 3 });
    expect(multipliers.defense).toEqual({ pts_band_0: 10 });
    expect(multipliers.idp).toEqual({ solo_tkl: 1 });
  });

  it('leaves baseball groups untouched when football definitions are present', async () => {
    const multipliers = await getScoringMultipliersForLeague(
      mockDb([...BASEBALL_DEFINITIONS, ...FOOTBALL_DEFINITIONS]),
      null,
    );

    expect(multipliers.batting).toEqual({ hr: 4 });
    expect(multipliers.pitching).toEqual({ outs_recorded: 1 });
    expect(multipliers.fielding).toEqual({ e_def: -0.5 });
  });

  it('omits football groups entirely when no definition supplies one', async () => {
    const multipliers = await getScoringMultipliersForLeague(
      mockDb(BASEBALL_DEFINITIONS),
      null,
    );

    // Absent rather than present-but-empty — camelCaseScoringMultipliers
    // distinguishes the two, and the baseball-only output shape is unchanged.
    expect(multipliers.passing).toBeUndefined();
    expect(multipliers.idp).toBeUndefined();
    expect(Object.keys(multipliers)).toEqual([
      'batting',
      'pitching',
      'fielding',
    ]);
  });

  it("applies a league's football override instead of the default", async () => {
    const multipliers = await getScoringMultipliersForLeague(
      mockDb(
        FOOTBALL_DEFINITIONS,
        [{ id: 900, leagueId: 42, isDefault: true }],
        [{ statDefinitionId: 10, multiplier: '6', isEnabled: true }],
      ),
      42,
    );

    // passing TD overridden 4 -> 6; the untouched groups keep their defaults.
    expect(multipliers.passing).toEqual({ td: 6 });
    expect(multipliers.rushing).toEqual({ yds: 0.1 });
  });

  it('drops a football stat the league has disabled', async () => {
    const multipliers = await getScoringMultipliersForLeague(
      mockDb(
        FOOTBALL_DEFINITIONS,
        [{ id: 900, leagueId: 42, isDefault: true }],
        [{ statDefinitionId: 13, multiplier: '3', isEnabled: false }],
      ),
      42,
    );

    expect(multipliers.kicking).toBeUndefined();
    expect(multipliers.passing).toEqual({ td: 4 });
  });
});

describe('football multipliers keep their raw source_column keys', () => {
  it('returns source_column keys verbatim, ready for a football-aware consumer', async () => {
    const multipliers = await getScoringMultipliersForLeague(
      mockDb(FOOTBALL_DEFINITIONS),
      null,
    );

    // Deliberately NOT camelCased. Unlike baseball, the football scoring engine
    // is snake_case-keyed throughout — DEFAULT_DEFENSE_SCORING uses
    // `fumbles_rec` / `def_td`, DEFAULT_IDP_SCORING uses `solo_tkl` — so
    // `camelCaseScoringMultipliers` is the wrong transform for these groups and
    // would resolve every one of them to weight 0.
    //
    // The points-allowed bands are worse than a casing mismatch: the DB models
    // them as `defense` stat rows named `pts_band_0` … `pts_band_35plus`, while
    // FootballScoringSettings carries them under a SEPARATE `defenseBands` key
    // named `pts_0` … `pts_35_plus`. Reconciling that is LS-9672's job; this
    // ticket only stops the definitions being discarded.
    expect(multipliers.defense).toEqual({ pts_band_0: 10 });
    expect(multipliers.idp).toEqual({ solo_tkl: 1 });
  });
});
