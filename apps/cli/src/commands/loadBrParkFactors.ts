/**
 * CLI command: load-br-park-factors
 *
 * Scrapes Baseball Reference league miscellaneous pages to load BPF
 * (Batters' Park Factor) and PPF (Pitchers' Park Factor) per team per
 * season into the park_factors table.
 *
 * Source pages:
 *   https://www.baseball-reference.com/leagues/AL/{year}-misc.shtml
 *   https://www.baseball-reference.com/leagues/NL/{year}-misc.shtml
 *
 * BR publishes a 3-year rolling average BPF/PPF with IPC/OPC corrections
 * and iterative batter/pitcher park effect separation.
 * See: https://www.baseball-reference.com/about/parkadjust.shtml
 *
 * These are the exact park factors BR uses in their own lWAR calculations,
 * making them the best match for reproducing BR's WAR values.
 *
 * Usage:
 *   ls-cli load-br-park-factors                        # load all seasons
 *   ls-cli load-br-park-factors --from 1914 --to 1935  # specific range
 *   ls-cli load-br-park-factors --upsert               # overwrite existing
 */

import { parse as parseHtml } from 'node-html-parser';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import { runWithPublicClient } from '@legacy-sports/db-client';
import type { PublicDb } from '@legacy-sports/db-client';
import { getFromBaseballReference } from '@legacy-sports/bref-client';

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const BR_BASE = 'https://www.baseball-reference.com/leagues';

/** AL started 1901; NL started 1876. */
const LEAGUE_RANGES: { league: string; firstYear: number }[] = [
  { league: 'NL', firstYear: 1876 },
  { league: 'AL', firstYear: 1901 },
];

// ────────────────────────────────────────────────────────────────────────────
// HTML parsing
// ────────────────────────────────────────────────────────────────────────────

interface BrParkFactorRow {
  season: number;
  team: string; // 3-letter abbreviation from BR URL (e.g. "NYY")
  bpf: number;
  ppf: number;
  brTeamName: string; // full team name from anchor text
}

/**
 * Parse a BR league-misc page and extract BPF/PPF per team.
 *
 * node-html-parser can't handle BR's full 156KB HTML, so we first extract
 * just the table via regex, then parse that smaller chunk.
 *
 * Table rows contain cells with `data-stat` attributes:
 *   - team_name: contains `<a href="/teams/{ABB}/{year}.shtml">Full Name</a>`
 *   - bpf: Batters' Park Factor
 *   - ppf: Pitchers' Park Factor
 */
function parseLeaguePage(html: string, season: number): BrParkFactorRow[] {
  const rows: BrParkFactorRow[] = [];

  // Step 1: Extract just the table HTML via regex (handles both direct and
  // commented-out tables)
  let tableHtml: string | undefined;

  // Try direct table first
  const directMatch = html.match(
    /<table[^>]*id="teams_miscellaneous"[^>]*>[\s\S]*?<\/table>/,
  );
  if (directMatch) {
    tableHtml = directMatch[0];
  } else {
    // Try inside HTML comment (BR lazy-loads some tables this way)
    const commentMatch = html.match(
      /<!--\s*(<table[^]*?id="teams_miscellaneous"[^]*?<\/table>)\s*-->/,
    );
    if (commentMatch) {
      tableHtml = commentMatch[1];
    }
  }

  if (!tableHtml) {
    return rows;
  }

  // Step 2: Parse the extracted table HTML
  const root = parseHtml(tableHtml);

  // BR may or may not have explicit <tbody>; query all <tr> directly
  const trs = root.querySelectorAll('tr');

  for (const tr of trs) {
    // Skip header rows (th-only rows) and spacer/total rows
    if (tr.classList.contains('thead') || tr.classList.contains('stat_total')) {
      continue;
    }

    const teamCell = tr.querySelector('[data-stat="team_name"]');
    const bpfCell = tr.querySelector('[data-stat="bpf"]');
    const ppfCell = tr.querySelector('[data-stat="ppf"]');

    if (!teamCell || !bpfCell || !ppfCell) continue;

    const bpfVal = parseInt(bpfCell.text.trim(), 10);
    const ppfVal = parseInt(ppfCell.text.trim(), 10);

    if (isNaN(bpfVal) || isNaN(ppfVal)) continue;

    // Extract team abbreviation from the link href: /teams/BOS/1927.shtml
    const anchor = teamCell.querySelector('a');
    let teamAbbrev = '';
    let teamName = '';

    if (anchor) {
      teamName = anchor.text.trim();
      const href = anchor.getAttribute('href') ?? '';
      const match = href.match(/\/teams\/([A-Z0-9]+)\//);
      if (match) {
        teamAbbrev = match[1];
      }
    }

    if (!teamAbbrev) {
      // Fallback: use raw text
      teamAbbrev = teamCell.text.trim().substring(0, 3).toUpperCase();
      teamName = teamCell.text.trim();
    }

    rows.push({
      season,
      team: teamAbbrev,
      bpf: bpfVal,
      ppf: ppfVal,
      brTeamName: teamName,
    });
  }

  return rows;
}

// ────────────────────────────────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────────────────────────────────

export async function handleLoadBrParkFactors(options: {
  upsert?: boolean;
  from?: string;
  to?: string;
}): Promise<void> {
  const { upsert = false } = options;
  const fromYear = options.from ? parseInt(options.from, 10) : 1876;
  const toYear = options.to ? parseInt(options.to, 10) : 2025;

  if (isNaN(fromYear) || isNaN(toYear) || fromYear > toYear) {
    LOGGER.error(`Invalid year range: ${String(fromYear)}-${String(toYear)}`);
    return;
  }

  // Build list of (league, year) pairs to scrape
  const jobs: { league: string; year: number }[] = [];
  for (const { league, firstYear } of LEAGUE_RANGES) {
    for (let y = Math.max(fromYear, firstYear); y <= toYear; y++) {
      jobs.push({ league, year: y });
    }
  }

  LOGGER.info(
    `Scraping BR park factors: ${String(jobs.length)} league-season pages ` +
      `(${String(fromYear)}-${String(toYear)}, upsert=${String(upsert)})…`,
  );

  const opts = getDbOptions();
  await runWithPublicClient(opts, async (db: PublicDb) => {
    let totalInserted = 0;
    let totalSkipped = 0;
    let pagesProcessed = 0;
    let pagesWithErrors = 0;

    for (const { league, year } of jobs) {
      const url = `${BR_BASE}/${league}/${String(year)}-misc.shtml`;

      try {
        // getFromBaseballReference handles rate limiting (15 req/min),
        // caching, and exponential backoff for 429/529 errors
        const html = await getFromBaseballReference(url);
        const rows = parseLeaguePage(html, year);

        if (rows.length === 0) {
          LOGGER.debug(
            `  ${league} ${String(year)}: no park factor rows found`,
          );
          pagesProcessed++;
          continue;
        }

        // Build batch INSERT
        const values = rows
          .map(
            (r) =>
              `(${String(r.season)}, '${r.team}', ${String(r.bpf)}, ${String(r.ppf)})`,
          )
          .join(',\n');

        const onConflict = upsert
          ? `ON CONFLICT (season, team) DO UPDATE SET
               bpf = EXCLUDED.bpf,
               ppf = EXCLUDED.ppf`
          : 'ON CONFLICT (season, team) DO NOTHING';

        const sql = `
          INSERT INTO public.park_factors (season, team, bpf, ppf)
          VALUES ${values}
          ${onConflict}
        `;

        const result = await db.execute(sql);
        const rowsAffected =
          typeof result === 'object' && result !== null && 'rowCount' in result
            ? (result.rowCount as number)
            : rows.length;

        totalInserted += rowsAffected;
        totalSkipped += rows.length - rowsAffected;
        pagesProcessed++;

        if (pagesProcessed % 25 === 0) {
          LOGGER.info(
            `  Progress: ${String(pagesProcessed)}/${String(jobs.length)} pages ` +
              `(${String(totalInserted)} rows inserted)`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        LOGGER.warn(`  ${league} ${String(year)} failed: ${msg}`);
        pagesWithErrors++;
      }
    }

    LOGGER.info(
      `Done — ${String(totalInserted)} rows inserted/updated, ` +
        `${String(totalSkipped)} skipped, ${String(pagesProcessed)} pages processed, ` +
        `${String(pagesWithErrors)} errors.`,
    );
  });
}
