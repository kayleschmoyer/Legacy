import htmlParser, { HTMLElement } from 'node-html-parser';
import { LOGGER } from '@legacy-sports/logging';
import { getCareerStats as getCareerStatsHtml } from './BRefSession';
import { getTable, getTableBody } from './HtmlParser';

/**
 * Career achievements for a player, derived from Baseball Reference.
 *
 * Repeatable awards store a count (e.g. 10 All-Star selections).
 * One-time awards store a boolean (HOF, ROY — a player can only win once).
 * World Series rings are technically repeatable (rare but e.g. dynasty teams).
 */
export interface CareerAchievements {
  allStarSelections: number;
  goldGloves: number;
  silverSluggers: number;
  mvpAwards: number;
  cyYoungAwards: number;
  worldSeriesRings: number;
  hallOfFame: boolean;
  rookieOfTheYear: boolean;
}

/** Empty achievements object — used as a safe default. */
export const EMPTY_ACHIEVEMENTS: CareerAchievements = {
  allStarSelections: 0,
  goldGloves: 0,
  silverSluggers: 0,
  mvpAwards: 0,
  cyYoungAwards: 0,
  worldSeriesRings: 0,
  hallOfFame: false,
  rookieOfTheYear: false,
};

/**
 * Award codes used by Baseball Reference in the `award_summary` column.
 * A single season row may contain multiple awards joined by commas.
 *
 * Known codes (case-insensitive, league suffix stripped before matching):
 *   AS     — All-Star selection
 *   GG     — Gold Glove Award
 *   SS     — Silver Slugger Award
 *   MVP    — (League) Most Valuable Player  (MVP-AL / MVP-NL / MVP-NL-28)
 *   CYA    — Cy Young Award                (CYA-AL / CYA-NL)
 *   ROY    — Rookie of the Year            (ROY-AL / ROY-NL)
 *   WS     — World Series Champion
 */
const AWARD_CODE_MAP: Record<string, keyof CareerAchievements> = {
  AS: 'allStarSelections',
  GG: 'goldGloves',
  SS: 'silverSluggers',
  MVP: 'mvpAwards',
  CYA: 'cyYoungAwards',
  ROY: 'rookieOfTheYear',
  WS: 'worldSeriesRings',
};

/** Normalize a raw bref award code to one of our canonical keys, or null.
 *
 * BRef uses two suffix conventions:
 *   - League suffix:  "MVP-AL", "CYA-NL", "ROY-AL"  → actual winner
 *   - Ballot rank:   "MVP-1" (winner), "MVP-2" (runner-up), "ROY-6" (6th)
 *
 * For voting awards (MVP, CYA, ROY) we only count rank-1 or a league suffix
 * (no digit) as an actual win.  Awards that are always wins (AS, GG, SS, WS)
 * have no numeric suffix at all.
 */
function normalizeCode(raw: string): keyof CareerAchievements | null {
  const trimmed = raw.trim().toUpperCase();

  // Split on first '-' to get base and optional suffix
  const dashIdx = trimmed.indexOf('-');
  const base = dashIdx === -1 ? trimmed : trimmed.slice(0, dashIdx);
  const suffix = dashIdx === -1 ? '' : trimmed.slice(dashIdx + 1);

  const key = AWARD_CODE_MAP[base];
  if (!key) {
    LOGGER.debug(`CareerAchievements: unknown award code "${raw.trim()}"`);
    return null;
  }

  // For voting awards with a numeric suffix, only rank 1 is a real win.
  // A league-letter suffix (AL, NL, etc.) means it was an actual award.
  if (suffix !== '') {
    const isNumeric = /^\d+$/.test(suffix);
    if (isNumeric && suffix !== '1') {
      // e.g. MVP-2, ROY-6 — ballot placement, not a win
      return null;
    }
    // e.g. MVP-1, MVP-AL, CYA-NL → win
  }

  return key;
}

/**
 * Accumulate achievement counts from a single `award_summary` cell value.
 * The value may be a comma-separated list (e.g. "AS,GG,MVP-AL").
 */
function accumulateAwardSummary(
  summary: string,
  acc: CareerAchievements,
): void {
  for (const part of summary.split(',')) {
    const key = normalizeCode(part);
    if (!key) {
      LOGGER.debug(`CareerAchievements: unknown award code "${part.trim()}"`);
      continue;
    }
    const current = acc[key];
    if (typeof current === 'boolean') {
      // One-time awards — flip to true and keep it
      (acc as unknown as Record<string, boolean | number>)[key] = true;
    } else {
      (acc as unknown as Record<string, boolean | number>)[key] = current + 1;
    }
  }
}

/**
 * Scan every data row in a table for award cells and accumulate.
 * Works for batting and pitching tables.
 *
 * @param seenYears - A Set used to deduplicate award rows across multiple
 *   tables.  A player like an NL pitcher has awards in *both* their batting
 *   and pitching tables for the same season.  By passing the same Set to
 *   each scanTable call we skip any (year, awardText) pair we've already
 *   counted.
 */
function scanTable(
  table: HTMLElement | null,
  acc: CareerAchievements,
  seenYears: Set<string>,
): void {
  if (!table) return;

  const body = getTableBody(table);
  if (!body) return;

  for (const row of body.getElementsByTagName('tr')) {
    const cells = [
      ...row.getElementsByTagName('th'),
      ...row.getElementsByTagName('td'),
    ];

    let yearId = '';
    let awardText = '';

    for (const cell of cells) {
      const stat = cell.getAttribute('data-stat');
      if (stat === 'year_id') {
        yearId = cell.text.trim();
      } else if (stat === 'award_summary' || stat === 'awards') {
        awardText = cell.text.trim();
      }
    }

    if (!awardText) continue;

    // Deduplicate by year: once we've counted awards for a year in any table
    // (batting, pitching, fielding), skip that year in all subsequent tables.
    // This prevents double-counting when the same season appears in multiple
    // tables (e.g. an NL pitcher who bats, or fielding rows per position).
    // Non-season rows (career totals, league avg, etc.) have empty year_id
    // and are safely skipped by the `!awardText` guard above.
    if (seenYears.has(yearId)) continue;
    seenYears.add(yearId);

    accumulateAwardSummary(awardText, acc);
  }
}

/**
 * Parse HOF status from the player info sidebar.
 * Baseball Reference marks Hall of Famers in the `<div id="info">` block
 * with text like "Hall of Fame" or a link to the HOF page.
 */
function parseHallOfFame(root: HTMLElement): boolean {
  // The info div contains biographical notes; HOF players have a "Hall of
  // Fame" mention, usually in a <p> with class "hof-note" or in a list item.
  const infoDiv = root.querySelector('#info');
  if (!infoDiv) return false;

  const text = infoDiv.innerText;
  return /hall\s+of\s+fame/i.test(text);
}

/**
 * Parse career achievements from an already-fetched player HTML string.
 * This is the primary entry point for the data-loader, which downloads
 * the page once and can then pass the same HTML to both this function and
 * the regular career-stats parser.
 */
export function parseCareerAchievementsFromHtml(
  html: string,
): CareerAchievements {
  const root = htmlParser(html, { comment: true });
  const acc: CareerAchievements = { ...EMPTY_ACHIEVEMENTS };

  // Scan batting, pitching, and fielding season tables.
  // BRef wraps most tables in HTML comments, so we must use getTable()
  // (which recurses into comment nodes) rather than querySelector().
  //
  // A single player's awards can appear in multiple tables for the same
  // season (e.g. an NL pitcher's AS/CYA in both the batting and pitching
  // rows, or fielding rows split by position/team).  We share `seenYears`
  // across all three calls so each (year, awardText) pair is counted once.
  const seenYears = new Set<string>();
  scanTable(getTable(root, 'players_standard_batting'), acc, seenYears);
  scanTable(getTable(root, 'players_standard_pitching'), acc, seenYears);
  scanTable(getTable(root, 'players_standard_fielding'), acc, seenYears);

  // HOF status from page sidebar
  acc.hallOfFame = parseHallOfFame(root);

  LOGGER.debug('Parsed career achievements', acc);
  return acc;
}

/**
 * Fetch and parse career achievements for a player given their bref ID.
 * Prefer `parseCareerAchievementsFromHtml` when you already have the HTML
 * (avoids a second HTTP request).
 */
export async function getCareerAchievements(
  brefId: string,
): Promise<CareerAchievements> {
  const html = await getCareerStatsHtml(brefId);
  return parseCareerAchievementsFromHtml(html);
}
