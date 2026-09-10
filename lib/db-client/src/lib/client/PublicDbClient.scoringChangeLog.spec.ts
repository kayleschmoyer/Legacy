import {
  type PublicDb,
  PublicSchema,
  updateLeagueScoringPositionBonuses,
  updateLeagueScoringProfileEntries,
} from './PublicDbClient';

/**
 * LS-9665 — `league_scoring_change_log` writes.
 *
 * The table exists from the initial schema migration; these tests pin the rule
 * that decides what lands in it. "One row per *changed* multiplier" is
 * load-bearing beyond audit tidiness: `Matchup.scoringIsStale` reads this table
 * as "the league's scoring inputs changed at this time", so a no-op row would
 * mark every already-scored matchup in the league stale.
 */

type Row = Record<string, unknown>;

interface RecordedInsert {
  table: unknown;
  values: Row[];
}

/**
 * The slices of Drizzle's builders the code under test actually touches. Both
 * builders are thenables, which is what lets the production code `await` them
 * directly.
 */
interface SelectChain extends PromiseLike<Row[]> {
  from: (table: unknown) => SelectChain;
  where: (predicate?: unknown) => SelectChain;
}

interface ValuesChain extends PromiseLike<void> {
  onConflictDoUpdate: (config: unknown) => Promise<void>;
}

interface InsertChain {
  values: (values: Row[]) => ValuesChain;
}

interface Tx {
  select: (projection?: unknown) => SelectChain;
  insert: (table: unknown) => InsertChain;
}

interface TxDb {
  transaction: jest.Mock<Promise<unknown>, [(tx: Tx) => Promise<unknown>]>;
}

/**
 * Minimal Drizzle transaction double.
 *
 * `updateLeagueScoringProfileEntries` issues its selects in a fixed order —
 * stat definitions, then existing entries, then the final read-back — so the
 * double serves `selectResults` positionally.
 */
function makeDb(selectResults: Row[][]) {
  const inserts: RecordedInsert[] = [];
  let selectCall = 0;

  const makeSelectChain = (rows: Row[]): SelectChain => {
    const chain: SelectChain = {
      from: () => chain,
      where: () => chain,
      then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
    };
    return chain;
  };

  const tx: Tx = {
    select: () => makeSelectChain(selectResults[selectCall++] ?? []),
    insert: (table: unknown): InsertChain => ({
      values: (values: Row[]): ValuesChain => {
        inserts.push({ table, values });
        return {
          onConflictDoUpdate: () => Promise.resolve(),
          then: (resolve, reject) =>
            Promise.resolve(undefined).then(resolve, reject),
        };
      },
    }),
  };

  const db: TxDb = {
    transaction: jest.fn((fn: (t: Tx) => Promise<unknown>) => fn(tx)),
  };

  const changeLogRows = (): Row[] =>
    inserts
      .filter((i) => i.table === PublicSchema.leagueScoringChangeLog)
      .flatMap((i) => i.values);

  // The double implements only the surface these two functions use; the cast
  // keeps that narrowing local to this helper rather than at each call site.
  return { db: db as unknown as PublicDb, raw: db, inserts, changeLogRows };
}

const definition = (id: number, defaultMultiplier: string) => ({
  id,
  defaultMultiplier,
  sourceColumn: `stat_${id}`,
});

const entry = (
  statDefinitionId: number,
  multiplier: string,
  isEnabled = true,
) => ({
  id: statDefinitionId * 100,
  profileId: 7,
  statDefinitionId,
  multiplier,
  isEnabled,
});

describe('updateLeagueScoringProfileEntries — change log', () => {
  it('writes no change-log row when the multiplier is re-sent unchanged', async () => {
    const { db, changeLogRows } = makeDb([
      [definition(1, '1.000')],
      [entry(1, '2.500')],
      [],
    ]);

    await updateLeagueScoringProfileEntries(
      db,
      7,
      [{ statDefinitionId: 1, multiplier: 2.5 }],
      42,
    );

    expect(changeLogRows()).toHaveLength(0);
  });

  it('writes no change-log row when a first save merely materialises the default', async () => {
    // No existing entry row, and the submitted multiplier equals the stat
    // definition's default — the multiplier in force does not change, so no
    // matchup scored under it became stale.
    const { db, changeLogRows } = makeDb([[definition(1, '1.000')], [], []]);

    await updateLeagueScoringProfileEntries(
      db,
      7,
      [{ statDefinitionId: 1, multiplier: 1 }],
      42,
    );

    expect(changeLogRows()).toHaveLength(0);
  });

  it('writes one row per changed multiplier, and none for the unchanged ones', async () => {
    const { db, changeLogRows } = makeDb([
      [definition(1, '1.000'), definition(2, '1.000'), definition(3, '1.000')],
      [entry(1, '2.500'), entry(2, '3.000'), entry(3, '1.000')],
      [],
    ]);

    await updateLeagueScoringProfileEntries(
      db,
      7,
      [
        { statDefinitionId: 1, multiplier: 2.5 }, // unchanged
        { statDefinitionId: 2, multiplier: 4 }, // changed
        { statDefinitionId: 3, multiplier: 1 }, // unchanged
      ],
      42,
    );

    const rows = changeLogRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      profileId: 7,
      statDefinitionId: 2,
      previousMultiplier: '3',
      newMultiplier: '4',
      changedBy: 42,
      action: 'updated',
    });
  });

  it('records changedBy as null when no user is supplied', async () => {
    const { db, changeLogRows } = makeDb([
      [definition(1, '1.000')],
      [entry(1, '1.000')],
      [],
    ]);

    await updateLeagueScoringProfileEntries(db, 7, [
      { statDefinitionId: 1, multiplier: 5 },
    ]);

    expect(changeLogRows()[0]).toMatchObject({ changedBy: null });
  });

  it("records a first-time override of a stat with no entry row as 'created'", async () => {
    const { db, changeLogRows } = makeDb([[definition(1, '1.000')], [], []]);

    await updateLeagueScoringProfileEntries(
      db,
      7,
      [{ statDefinitionId: 1, multiplier: 3 }],
      42,
    );

    const rows = changeLogRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'created',
      previousMultiplier: '1',
      newMultiplier: '3',
    });
  });

  it("records disabling a stat as 'disabled'", async () => {
    const { db, changeLogRows } = makeDb([
      [definition(1, '1.000')],
      [entry(1, '2.500', true)],
      [],
    ]);

    await updateLeagueScoringProfileEntries(
      db,
      7,
      [{ statDefinitionId: 1, isEnabled: false }],
      42,
    );

    const rows = changeLogRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'disabled' });
  });

  it("records re-enabling a stat as 'updated' (the enum has no re-enabled label)", async () => {
    const { db, changeLogRows } = makeDb([
      [definition(1, '1.000')],
      [entry(1, '2.500', false)],
      [],
    ]);

    await updateLeagueScoringProfileEntries(
      db,
      7,
      [{ statDefinitionId: 1, isEnabled: true }],
      42,
    );

    const rows = changeLogRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'updated' });
  });

  it('writes the change log inside the same transaction as the entry upsert', async () => {
    const { db, raw, inserts } = makeDb([
      [definition(1, '1.000')],
      [entry(1, '1.000')],
      [],
    ]);

    await updateLeagueScoringProfileEntries(
      db,
      7,
      [{ statDefinitionId: 1, multiplier: 9 }],
      42,
    );

    expect(raw.transaction).toHaveBeenCalledTimes(1);
    // Both writes go through the same tx handle, entries first.
    expect(inserts.map((i) => i.table)).toEqual([
      PublicSchema.leagueScoringProfileEntries,
      PublicSchema.leagueScoringChangeLog,
    ]);
  });
});

describe('updateLeagueScoringPositionBonuses — change log', () => {
  const bonus = (
    statDefinitionId: number,
    position: string,
    bonusMultiplier: string,
    isEnabled = true,
  ) => ({
    id: 1,
    profileId: 7,
    statDefinitionId,
    position,
    bonusMultiplier,
    isEnabled,
  });

  it('writes a change-log row carrying the position in the position column', async () => {
    const { db, changeLogRows } = makeDb([
      [definition(1, '1.000')],
      [bonus(1, '1B', '0.500')],
      [],
    ]);

    await updateLeagueScoringPositionBonuses(
      db,
      7,
      [{ statDefinitionId: 1, position: '1B', bonusMultiplier: 1.25 }],
      42,
    );

    const rows = changeLogRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      profileId: 7,
      statDefinitionId: 1,
      previousMultiplier: '0.5',
      newMultiplier: '1.25',
      changedBy: 42,
      position: '1B',
      action: 'updated',
    });
  });

  it('writes no row when a bonus is re-sent unchanged', async () => {
    const { db, changeLogRows } = makeDb([
      [definition(1, '1.000')],
      [bonus(1, '1B', '0.500')],
      [],
    ]);

    await updateLeagueScoringPositionBonuses(
      db,
      7,
      [{ statDefinitionId: 1, position: '1B', bonusMultiplier: 0.5 }],
      42,
    );

    expect(changeLogRows()).toHaveLength(0);
  });

  it("treats an absent bonus as 0 and records the first one as 'created'", async () => {
    const { db, changeLogRows } = makeDb([[definition(1, '1.000')], [], []]);

    await updateLeagueScoringPositionBonuses(
      db,
      7,
      [{ statDefinitionId: 1, position: 'SS', bonusMultiplier: 2 }],
      42,
    );

    const rows = changeLogRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'created',
      previousMultiplier: '0',
      newMultiplier: '2',
      position: 'SS',
    });
  });

  it('keeps two positions on the same stat as distinct rows', async () => {
    const { db, changeLogRows } = makeDb([
      [definition(1, '1.000')],
      [bonus(1, '1B', '0.500')],
      [],
    ]);

    await updateLeagueScoringPositionBonuses(
      db,
      7,
      [
        { statDefinitionId: 1, position: '1B', bonusMultiplier: 1 },
        { statDefinitionId: 1, position: 'SS', bonusMultiplier: 3 },
      ],
      42,
    );

    const rows = changeLogRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => String(r.position)).sort()).toEqual(['1B', 'SS']);
  });
});
