import {
  aggregateFielding,
  assignGameNumbers,
  type CsvRow,
  isRegularSeasonRow,
  isValueRow,
  toStoredBatting,
  toStoredPitching,
} from './transform';
import {
  RETROSHEET_PAYLOAD_VERSION,
  type RetrosheetSeasonPayload,
} from './types';

/**
 * Season CSV rows -> one payload per (brefId, season).
 *
 * Lives in the library rather than the ingest command so the row filtering and
 * the empty-payload guard are unit-testable without S3 or network access.
 */

export interface SeasonPayloadsResult {
  payloads: RetrosheetSeasonPayload[];
  /** Retrosheet ids with no Chadwick bref mapping. */
  unmapped: Set<string>;
  /**
   * brefIds left with no batting AND no pitching rows after filtering, and so
   * not written. See {@link buildSeasonPayloads}.
   */
  empty: Set<string>;
}

function groupByPlayer(rows: CsvRow[]): Map<string, CsvRow[]> {
  const grouped = new Map<string, CsvRow[]>();
  for (const row of rows) {
    // Postseason and All-Star rows are dropped HERE, before game numbering, so
    // gameNum counts regular-season games only — matching the BBRef game logs
    // this corpus replaced (LS-10230).
    if (!isValueRow(row) || !isRegularSeasonRow(row)) {
      continue;
    }
    const id = row['id'];
    if (!id) {
      continue;
    }
    const bucket = grouped.get(id);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(id, [row]);
    }
  }
  return grouped;
}

export function buildSeasonPayloads(
  season: number,
  batting: CsvRow[],
  pitching: CsvRow[],
  fielding: CsvRow[],
  retroToBref: Map<string, string>,
): SeasonPayloadsResult {
  const byPlayer = new Map<
    string,
    { batting: CsvRow[]; pitching: CsvRow[]; fielding: CsvRow[] }
  >();

  const ensure = (id: string) => {
    let entry = byPlayer.get(id);
    if (!entry) {
      entry = { batting: [], pitching: [], fielding: [] };
      byPlayer.set(id, entry);
    }
    return entry;
  };

  for (const [id, rows] of groupByPlayer(batting)) ensure(id).batting = rows;
  for (const [id, rows] of groupByPlayer(pitching)) ensure(id).pitching = rows;
  for (const [id, rows] of groupByPlayer(fielding)) ensure(id).fielding = rows;

  const payloads: RetrosheetSeasonPayload[] = [];
  const unmapped = new Set<string>();
  const empty = new Set<string>();

  for (const [retroId, groups] of byPlayer) {
    const brefId = retroToBref.get(retroId);
    if (!brefId) {
      unmapped.add(retroId);
      continue;
    }

    // An object with no batting and no pitching would read as an S3 "hit"
    // with no games, so the stats Lambda would record noGameDataFound instead
    // of falling back to the scraper. Leave the key absent so it 404s.
    if (groups.batting.length === 0 && groups.pitching.length === 0) {
      empty.add(brefId);
      continue;
    }

    // game_number is a per-player-season sequence over every game the player
    // appeared in, in any capacity — so derive it from the union of all three
    // stat families rather than per-family, keeping the three tables' game
    // numbering consistent for the same player-season.
    const allRows = [...groups.batting, ...groups.pitching, ...groups.fielding];
    const gameNumbers = assignGameNumbers(allRows);
    const numberFor = (gid: string) => gameNumbers.get(gid) ?? 0;

    // Retrosheet emits one fielding row per position per game; the target
    // table is one row per player-game, so collapse by game first.
    const fieldingByGame = new Map<string, CsvRow[]>();
    for (const row of groups.fielding) {
      const gid = row['gid'];
      const bucket = fieldingByGame.get(gid);
      if (bucket) {
        bucket.push(row);
      } else {
        fieldingByGame.set(gid, [row]);
      }
    }

    payloads.push({
      v: RETROSHEET_PAYLOAD_VERSION,
      brefId,
      retroId,
      season,
      batting: groups.batting.map((row) =>
        toStoredBatting(row, season, numberFor(row['gid'])),
      ),
      pitching: groups.pitching.map((row) =>
        toStoredPitching(row, season, numberFor(row['gid'])),
      ),
      fielding: [...fieldingByGame.values()].map((rows) =>
        aggregateFielding(rows, season, numberFor(rows[0]['gid'])),
      ),
    });
  }

  return { payloads, unmapped, empty };
}
