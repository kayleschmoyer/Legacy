/**
 * CLI command: load-on-this-day-events
 *
 * Fetches MLB Stats API transaction records for every calendar day across
 * years 2008–present and inserts notable events (trades, free-agent signings,
 * contract extensions) into the `on_this_day_events` table.
 *
 * Coverage: all 366 calendar days × ~18 years ≈ 6,600 API calls.
 * A configurable delay (default 200 ms) is applied between requests to avoid
 * rate-limiting.
 *
 * Notable event filter:
 *   TR  — Trades (always included)
 *   SFA — Signed as Free Agent (excluded if description contains "minor league")
 *   CE  — Contract Extension
 *   EX  — Contract Extension (alternate code)
 *
 * Usage:
 *   ls-cli load-on-this-day-events
 *   ls-cli load-on-this-day-events --from 2015 --to 2020
 *   ls-cli load-on-this-day-events --delay 500
 *   ls-cli load-on-this-day-events --upsert
 */

import { LOGGER } from '@legacy-sports/logging';
import { cleanDescription } from '@legacy-sports/utils';
import { getDbOptions } from '@legacy-sports/utils/node';
import { runWithPublicClient } from '@legacy-sports/db-client';
import { sql } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MlbTransactionPerson {
  id?: number;
  fullName?: string;
}

interface MlbTransactionTeam {
  name?: string;
  abbreviation?: string;
}

interface MlbTransaction {
  id?: number;
  person?: MlbTransactionPerson;
  fromTeam?: MlbTransactionTeam;
  toTeam?: MlbTransactionTeam;
  typeCode?: string;
  description?: string;
  date?: string; // YYYY-MM-DD
}

interface MlbTransactionsResponse {
  transactions?: MlbTransaction[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';
const FIRST_YEAR = 2008;
/** Transaction type codes we consider notable enough to surface in the feed. */
const NOTABLE_TYPES = new Set(['TR', 'SFA', 'CE', 'EX']);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns true if the transaction is notable enough to store.
 *
 * - Trades (TR) are always included.
 * - Free-agent signings (SFA) are included unless they mention "minor league"
 *   to filter out non-roster minor league contracts.
 * - Contract extensions (CE/EX) are always included.
 */
function isNotable(tx: MlbTransaction): boolean {
  const code = tx.typeCode ?? '';
  if (!NOTABLE_TYPES.has(code)) return false;
  if (code === 'SFA') {
    const desc = (tx.description ?? '').toLowerCase();
    if (desc.includes('minor league') || desc.includes('minors')) return false;
  }
  return true;
}

/** Generate every valid calendar date (month/day) for a non-leap year, plus Feb 29. */
function allCalendarDays(): { month: number; day: number }[] {
  const days: { month: number; day: number }[] = [];
  const daysInMonth = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= daysInMonth[m]; d++) {
      days.push({ month: m, day: d });
    }
  }
  return days;
}

async function fetchTransactions(dateStr: string): Promise<MlbTransaction[]> {
  const url = `${MLB_API_BASE}/transactions?startDate=${dateStr}&endDate=${dateStr}&sportId=1`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`MLB API ${res.status} for ${dateStr}`);
  }
  const data = (await res.json()) as MlbTransactionsResponse;
  return data.transactions ?? [];
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export interface HandleLoadOnThisDayEventsArgs {
  from?: number;
  to?: number;
  delay?: number;
  upsert?: boolean;
}

export async function handleLoadOnThisDayEvents(
  args: HandleLoadOnThisDayEventsArgs,
): Promise<void> {
  const currentYear = new Date().getFullYear();
  const fromYear = args.from ?? FIRST_YEAR;
  const toYear = args.to ?? currentYear;
  const delayMs = args.delay ?? 200;
  const upsert = args.upsert ?? false;

  LOGGER.info(
    `Loading On This Day events from MLB Stats API (${fromYear}–${toYear})`,
  );

  const calendarDays = allCalendarDays();
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFetched = 0;

  await runWithPublicClient(getDbOptions(), async (db) => {
    for (const { month, day } of calendarDays) {
      const mStr = String(month).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');

      for (let year = fromYear; year <= toYear; year++) {
        // Feb 29 only exists in leap years
        if (month === 2 && day === 29 && year % 4 !== 0) continue;

        const dateStr = `${year}-${mStr}-${dStr}`;

        try {
          await sleep(delayMs);
          const transactions = await fetchTransactions(dateStr);
          totalFetched += transactions.length;

          const notable = transactions.filter(isNotable);

          for (const tx of notable) {
            const mlbTransactionId = tx.id ?? null;
            const playerName = tx.person?.fullName ?? null;
            const fromTeam = tx.fromTeam?.name ?? null;
            const toTeam = tx.toTeam?.name ?? null;
            const eventType = tx.typeCode ?? '';
            const description = cleanDescription(tx.description ?? '');

            if (upsert && mlbTransactionId !== null) {
              await db.execute(sql`
                INSERT INTO on_this_day_events
                  (month, day, year, event_type, description, player_name, from_team, to_team, mlb_transaction_id)
                VALUES
                  (${month}, ${day}, ${year}, ${eventType}, ${description}, ${playerName}, ${fromTeam}, ${toTeam}, ${mlbTransactionId})
                ON CONFLICT (mlb_transaction_id) WHERE mlb_transaction_id IS NOT NULL
                DO UPDATE SET
                  event_type = EXCLUDED.event_type,
                  description = EXCLUDED.description,
                  player_name = EXCLUDED.player_name,
                  from_team = EXCLUDED.from_team,
                  to_team = EXCLUDED.to_team
              `);
              totalInserted++;
            } else {
              try {
                await db.execute(sql`
                  INSERT INTO on_this_day_events
                    (month, day, year, event_type, description, player_name, from_team, to_team, mlb_transaction_id)
                  VALUES
                    (${month}, ${day}, ${year}, ${eventType}, ${description}, ${playerName}, ${fromTeam}, ${toTeam}, ${mlbTransactionId})
                `);
                totalInserted++;
              } catch (err: unknown) {
                const message =
                  err instanceof Error ? err.message : String(err);
                if (
                  message.includes('duplicate key') ||
                  message.includes('unique constraint')
                ) {
                  totalSkipped++;
                } else {
                  throw err;
                }
              }
            }
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          LOGGER.warn(`Skipping ${dateStr}: ${message}`);
        }
      }

      // Progress log every 10 days
      const dayIndex = (month - 1) * 31 + day;
      if (dayIndex % 10 === 0) {
        LOGGER.info(
          `Progress: month ${month}, day ${day} — inserted ${totalInserted}, skipped ${totalSkipped}`,
        );
      }
    }
  });

  LOGGER.info(
    `Done. API records fetched: ${totalFetched}. Inserted: ${totalInserted}. Skipped (duplicate): ${totalSkipped}.`,
  );
}
