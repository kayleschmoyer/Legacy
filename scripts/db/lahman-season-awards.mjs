#!/usr/bin/env node
/**
 * Build the mlb_season_awards seed rows from the Lahman database (LS-10674).
 *
 * Inputs are the Lahman AwardsPlayers.csv and People.csv tables (any Lahman
 * CSV distribution, or the Lahman R package's data/*.RData converted to CSV).
 * Output is a SQL VALUES list of (bref_id, season, award, league) tuples for
 * the awards the web Career Arc chart understands, keyed by People.bbrefID
 * (Lahman playerID differs from the B-Ref id for ~1,800 players).
 *
 * Usage:
 *   node scripts/db/lahman-season-awards.mjs <AwardsPlayers.csv> <People.csv> > values.sql
 *
 * Paste the output into a new seed migration when Lahman publishes a new
 * season (the migration's INSERT is ON CONFLICT DO NOTHING).
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Lahman awardID → B-Ref award code. */
export const LAHMAN_AWARD_CODES = {
  'Most Valuable Player': 'MVP',
  'Cy Young Award': 'CYA',
  'Rookie of the Year': 'ROY',
  'Gold Glove': 'GG',
  'Silver Slugger': 'SS',
};

/** Minimal RFC 4180 CSV parser → array of objects keyed by the header row. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);

  const [header = [], ...body] = rows;
  return body.map((r) =>
    Object.fromEntries(header.map((name, i) => [name, r[i] ?? ''])),
  );
}

/**
 * Map Lahman award rows to unique, sorted { brefId, season, award, league }
 * rows. Drops award types the chart doesn't use and players with no bbrefID.
 */
export function buildAwardRows(awardsPlayers, people) {
  const brefByLahman = new Map(
    people.filter((p) => p.bbrefID).map((p) => [p.playerID, p.bbrefID]),
  );
  const byKey = new Map();
  for (const a of awardsPlayers) {
    const award = LAHMAN_AWARD_CODES[a.awardID];
    const brefId = brefByLahman.get(a.playerID);
    const season = Number(a.yearID);
    if (!award || !brefId || !Number.isInteger(season)) continue;
    const key = `${brefId}|${season}|${award}`;
    if (!byKey.has(key)) {
      byKey.set(key, { brefId, season, award, league: a.lgID });
    }
  }
  return [...byKey.values()].sort(
    (x, y) =>
      x.brefId.localeCompare(y.brefId) ||
      x.season - y.season ||
      x.award.localeCompare(y.award),
  );
}

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Render rows as a SQL VALUES list body, one tuple per line. */
export function toSqlValues(rows) {
  return rows
    .map(
      (r) =>
        `(${quote(r.brefId)},${r.season},${quote(r.award)},${quote(r.league)})`,
    )
    .join(',\n');
}

function main([awardsPath, peoplePath]) {
  if (!awardsPath || !peoplePath) {
    console.error(
      'Usage: node scripts/db/lahman-season-awards.mjs <AwardsPlayers.csv> <People.csv>',
    );
    process.exit(1);
  }
  const rows = buildAwardRows(
    parseCsv(readFileSync(awardsPath, 'utf8')),
    parseCsv(readFileSync(peoplePath, 'utf8')),
  );
  console.error(`${rows.length} award rows`);
  console.log(toSqlValues(rows));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2));
}
