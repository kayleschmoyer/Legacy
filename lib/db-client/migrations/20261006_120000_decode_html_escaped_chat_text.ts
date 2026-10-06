import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: decode chat text that was HTML-escaped on write (LS-10678)
 *
 * LS-6300 (merged 2026-08-23 09:54:24 UTC) ran `escapeHtml` over user text
 * before persisting it, so `&`, `<`, `>`, `"` and `'` were stored as `&amp;`,
 * `&lt;`, `&gt;`, `&quot;` and `&#39;`. Every client renders the text as a
 * React/RN text node (which escapes on output), so users saw the literal
 * entities. The resolvers now store raw text; this decodes the rows the
 * buggy path already wrote. Rendering stays inert — the decoded text is still
 * only ever rendered as a text node, never as HTML.
 *
 * Scope — only rows the escaping path could have written:
 *   - league_messages: user-authored (`user_id IS NOT NULL`) `text`/`gif`/
 *     `announcement` rows (sendLeagueMessage, post/updateLeagueAnnouncement).
 *     System/trade/draft rows are written unescaped by other code paths.
 *   - direct_messages: sendDirectMessage rows; trade-offer DMs (written
 *     unescaped by proposeTrade, prefixed "🔁 Trade offer from") are skipped.
 *   - league_message_reports.reason (reportLeagueMessage).
 *   - league_activity_log `league_announcement` payload.messageText, which
 *     postLeagueAnnouncement copied from the escaped text.
 * and, within those, only rows created at/after the LS-6300 merge whose text
 * has the escaped shape: contains an entity, contains no raw `< > " '`, and
 * every `&` starts one of the five entities. Raw text from before LS-6300 or
 * from the fixed resolvers almost never has that shape.
 *
 * Idempotent + reversible: each decoded row's original and decoded text is
 * recorded in `ls10678_html_entity_backfill` before the update. Re-running
 * up() skips rows already recorded (so a literal `&amp;lt;` is never decoded
 * twice), and only updates a row whose text still equals its original.
 * down() restores the original only where the text still equals the decoded
 * value (so later edits are kept), then drops the record table.
 */

const SINCE = `timestamptz '2026-08-23 09:54:24+00'`;
const BACKUP = 'public.ls10678_html_entity_backfill';

/** SQL predicate: `expr` looks like escapeHtml output. */
const escapedShape = (expr: string): string =>
  `(${expr} ~ '&(amp|lt|gt|quot|#39);'` +
  ` AND ${expr} !~ '[<>"'']'` +
  ` AND ${expr} !~ '&(?!(amp|lt|gt|quot|#39);)')`;

/** SQL expression inverting escapeHtml (`&amp;` last, so `&amp;lt;` → `&lt;`). */
const decoded = (expr: string): string =>
  `replace(replace(replace(replace(replace(${expr}, '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&')`;

interface Target {
  table: string;
  /** SQL expression reading the text from alias `t`. */
  textExpr: string;
  /** Extra scope predicate on alias `t`. */
  scope: string;
  /** SET clause writing `value` (a SQL expression) back to alias `t`. */
  set: (value: string) => string;
}

const TARGETS: Target[] = [
  {
    table: 'league_messages',
    textExpr: 't.message_text',
    scope: `t.user_id IS NOT NULL AND t.message_type IN ('text', 'gif', 'announcement') AND t.created_at >= ${SINCE}`,
    set: (value) => `message_text = ${value}`,
  },
  {
    table: 'direct_messages',
    textExpr: 't.message_text',
    scope: `t.created_at >= ${SINCE} AND t.message_text NOT LIKE '\u{1F501} Trade offer from%'`,
    set: (value) => `message_text = ${value}`,
  },
  {
    table: 'league_message_reports',
    textExpr: 't.reason',
    scope: `t.created_at >= ${SINCE}`,
    set: (value) => `reason = ${value}`,
  },
  {
    table: 'league_activity_log',
    textExpr: `(t.payload->>'messageText')`,
    scope: `t.event_type = 'league_announcement' AND t.occurred_at >= ${SINCE}`,
    set: (value) =>
      `payload = jsonb_set(t.payload, '{messageText}', to_jsonb(${value}))`,
  },
];

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔤 Decoding HTML-escaped chat text (LS-10678)...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${BACKUP} (
      source_table text NOT NULL,
      row_id integer NOT NULL,
      original_text text NOT NULL,
      decoded_text text NOT NULL,
      PRIMARY KEY (source_table, row_id)
    );
  `);

  for (const { table, textExpr, scope, set } of TARGETS) {
    await db.execute(`
      INSERT INTO ${BACKUP} (source_table, row_id, original_text, decoded_text)
      SELECT '${table}', t.id, ${textExpr}, ${decoded(textExpr)}
      FROM public.${table} t
      WHERE ${scope} AND ${escapedShape(textExpr)}
      ON CONFLICT (source_table, row_id) DO NOTHING;
    `);
    await db.execute(`
      UPDATE public.${table} t SET ${set('b.decoded_text')}
      FROM ${BACKUP} b
      WHERE b.source_table = '${table}' AND b.row_id = t.id
        AND ${textExpr} = b.original_text;
    `);
  }

  const counts = await db.execute(
    `SELECT source_table, count(*)::int AS n FROM ${BACKUP} GROUP BY source_table ORDER BY source_table;`,
  );
  console.log('✅ Decoded rows by table:', JSON.stringify(counts));
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('↩️  Restoring HTML-escaped chat text (LS-10678)...');

  const exists = await db.execute(
    `SELECT to_regclass('${BACKUP}') IS NOT NULL AS present;`,
  );
  const present = Array.isArray(exists) && exists[0]?.present === true;
  if (!present) {
    console.log('✅ Nothing to restore');
    return;
  }

  for (const { table, textExpr, set } of TARGETS) {
    await db.execute(`
      UPDATE public.${table} t SET ${set('b.original_text')}
      FROM ${BACKUP} b
      WHERE b.source_table = '${table}' AND b.row_id = t.id
        AND ${textExpr} = b.decoded_text;
    `);
  }

  await db.execute(`DROP TABLE ${BACKUP};`);
  console.log('✅ Restored escaped text and dropped the backfill record');
};
