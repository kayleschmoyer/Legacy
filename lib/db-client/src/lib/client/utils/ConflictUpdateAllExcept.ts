import { getTableColumns, SQL, sql, Table } from 'drizzle-orm';

export function conflictUpdateAllExcept<
  T extends Table,
  E extends (keyof T['$inferInsert'])[]
>(table: T, except: E) {
  const columns = getTableColumns(table);
  const updateColumns = Object.entries(columns).filter(
    ([col, val]) =>
      !except.includes(col as keyof typeof table.$inferInsert) && !val.generated
  );

  return updateColumns.reduce(
    (acc, [colName, table]) => ({
      ...acc,
      [colName]: sql.raw(`excluded.${table.name}`),
    }),
    {}
  ) as Omit<Record<keyof typeof table.$inferInsert, SQL>, E[number]>;
}
