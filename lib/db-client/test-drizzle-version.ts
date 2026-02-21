import { pgTable, text } from 'drizzle-orm/pg-core';

const table = pgTable('users', {
  name: text('name'),
});

const column = table.name;

try {
  // eslint-disable-next-line no-console -- diagnostic script for Drizzle API verification
  console.log('Testing column.asc():');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- diagnostic: testing Drizzle runtime API
  const resk = column.asc();
  const reskObj = resk as unknown as Record<string, unknown>;
  // eslint-disable-next-line no-console -- diagnostic script
  if (typeof reskObj === 'object' && typeof reskObj.nullsLast === 'function')
    console.log('Works!');
  // eslint-disable-next-line no-console -- diagnostic script
  else console.log('nullsLast missing on result of column.asc()');

  // eslint-disable-next-line no-console -- diagnostic script
  console.log('Testing column.desc():');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- diagnostic: testing Drizzle runtime API
  const resd = column.desc();
  const resdObj = resd as unknown as Record<string, unknown>;
  // eslint-disable-next-line no-console -- diagnostic script
  if (typeof resdObj === 'object' && typeof resdObj.nullsLast === 'function')
    console.log('Works!');
  // eslint-disable-next-line no-console -- diagnostic script
  else console.log('nullsLast missing on result of column.desc()');
} catch (e) {
  // eslint-disable-next-line no-console -- diagnostic script
  console.error(e);
}
