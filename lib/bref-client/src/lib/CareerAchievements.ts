import htmlParser, { HTMLElement } from 'node-html-parser';
import { LOGGER } from '@legacy-sports/logging';
import { getCareerStats as getCareerStatsHtml } from './BRefSession';
import { getTableBody } from './HtmlParser';

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

/** Normalize a raw bref award code to one of our canonical keys, or null. */
function normalizeCode(raw: string): keyof CareerAchievements | null {
  // Strip trailing league suffix: "MVP-AL" → "MVP", "ROY-NL" → "ROY"
  const base = raw
    .trim()
    .toUpperCase()
    .replace(/-[A-Z0-9]+$/, '');
  return AWARD_CODE_MAP[base] ?? null;
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
 * Scan every data row in a table for `award_summary` cells and accumulate.
 * Works for batting, pitching, and fielding tables.
 */
function scanTable(table: HTMLElement | null, acc: CareerAchievements): void {
  if (!table) return;

  const body = getTableBody(table);
  if (!body) return;

  for (const row of body.getElementsByTagName('tr')) {
    const cells = [
      ...row.getElementsByTagName('th'),
      ...row.getElementsByTagName('td'),
    ];
    for (const cell of cells) {
      if (cell.getAttribute('data-stat') === 'award_summary') {
        const text = cell.text.trim();
        if (text) {
          accumulateAwardSummary(text, acc);
        }
      }
    }
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

  // Scan batting, pitching, and fielding season tables
  scanTable(root.querySelector('#players_standard_batting'), acc);
  scanTable(root.querySelector('#players_standard_pitching'), acc);
  scanTable(root.querySelector('#players_standard_fielding'), acc);

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
