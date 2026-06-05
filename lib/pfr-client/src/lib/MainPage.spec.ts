import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as PFRSession from './PFRSession';
import {
  getAllDefenseSeasonTotalsFromMainPage,
  getAllSeasonTotalsFromMainPage,
  parseMainPageDefenseSeasonTotals,
  parseMainPageSeasonTotals,
} from './CareerStats';

jest.mock('./PFRSession');
const mockGetPlayerPage = jest.mocked(PFRSession.getPlayerPage);

const fix = (name: string) =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf-8');

const WR_HTML = fix('wr-main-page.html');
const RB_HTML = fix('rb-main-page.html');
const QB_HTML = fix('qb-main-page.html');
const K_HTML = fix('k-main-page.html');
const IDP_HTML = fix('idp-main-page.html');
const IDP_MISSED_SEASON_HTML = fix('idp-main-page-missed-season.html');

const wr = { id: 10, pfrId: 'AdamDa01' };
const rb = { id: 20, pfrId: 'HenrDe00' };
const qb = { id: 30, pfrId: 'MahoPa00' };
const kicker = { id: 40, pfrId: 'TuckJu00' };
const idp = { id: 50, pfrId: 'TestLb00' };

describe('parseMainPageSeasonTotals — WR (receiving_and_rushing in comment)', () => {
  it('parses two seasons from comment-wrapped receiving_and_rushing table', () => {
    const seasons = parseMainPageSeasonTotals(WR_HTML, wr);

    expect(seasons).toHaveLength(2);
    expect(seasons[0].receiving).toMatchObject({
      playerId: 10,
      season: 2014,
      team: 'GNB',
      g: 16,
      tgt: 66,
      rec: 38,
      yds: 446,
      td: 3,
    });
    expect(seasons[0].rushing).toBeNull();
    expect(seasons[0].passing).toBeNull();
    expect(seasons[0].kicking).toBeNull();
  });

  it('parses receiving + rushing for a season where WR had carries', () => {
    const seasons = parseMainPageSeasonTotals(WR_HTML, wr);

    expect(seasons[1].receiving).toMatchObject({
      season: 2015,
      g: 15,
      tgt: 94,
      rec: 50,
      yds: 536,
      td: 1,
      fumbles: 1,
    });
    expect(seasons[1].rushing).toMatchObject({
      season: 2015,
      g: 15,
      att: 2,
      yds: 8,
      td: 0,
    });
  });

  it('skips the Career totals row', () => {
    const seasons = parseMainPageSeasonTotals(WR_HTML, wr);
    // Career row has year_id="Career" which parseInt returns NaN → filtered out.
    expect(seasons).toHaveLength(2);
    expect(seasons.map((s) => s.receiving?.season)).toEqual([2014, 2015]);
  });
});

describe('parseMainPageSeasonTotals — RB (rushing_and_receiving, no comment)', () => {
  it('parses rushing + receiving from rushing_and_receiving table', () => {
    const seasons = parseMainPageSeasonTotals(RB_HTML, rb);

    expect(seasons).toHaveLength(2);
    expect(seasons[0].rushing).toMatchObject({
      playerId: 20,
      season: 2019,
      g: 16,
      att: 303,
      yds: 1540,
      td: 16,
      fumbles: 1,
    });
    expect(seasons[0].receiving).toMatchObject({
      season: 2019,
      g: 16,
      tgt: 24,
      rec: 18,
      yds: 206,
      td: 2,
    });
  });

  it('emits null receiving when rec=0 and tgt=0', () => {
    const seasons = parseMainPageSeasonTotals(RB_HTML, rb);

    expect(seasons[1].rushing).toMatchObject({
      season: 2020,
      att: 378,
      yds: 2027,
      td: 17,
    });
    expect(seasons[1].receiving).toBeNull();
  });
});

describe('parseMainPageSeasonTotals — QB (passing + rushing_and_receiving)', () => {
  it('parses passing from passing table', () => {
    const seasons = parseMainPageSeasonTotals(QB_HTML, qb);

    expect(seasons).toHaveLength(2);
    expect(seasons[0].passing).toMatchObject({
      playerId: 30,
      season: 2018,
      team: 'KAN',
      g: 16,
      cmp: 383,
      att: 580,
      yds: 5097,
      td: 50,
      int: 12,
    });
  });

  it('merges QB rushing from skill table into the same season', () => {
    const seasons = parseMainPageSeasonTotals(QB_HTML, qb);

    expect(seasons[0].rushing).toMatchObject({
      season: 2018,
      att: 60,
      yds: 272,
      td: 2,
    });
    expect(seasons[0].receiving).toBeNull();
  });

  it('covers both seasons from passing + skill tables', () => {
    const seasons = parseMainPageSeasonTotals(QB_HTML, qb);

    expect(seasons[1].passing).toMatchObject({ season: 2019, att: 484 });
    expect(seasons[1].rushing).toMatchObject({ season: 2019, att: 51 });
  });
});

describe('parseMainPageSeasonTotals — K (scoring table)', () => {
  it('parses kicking stats from scoring table', () => {
    const seasons = parseMainPageSeasonTotals(K_HTML, kicker);

    expect(seasons).toHaveLength(3);
    expect(seasons[0].kicking).toMatchObject({
      playerId: 40,
      season: 2021,
      team: 'RAV',
      g: 17,
      fgm: 37,
      fga: 40,
      xpm: 44,
      xpa: 45,
    });
    expect(seasons[0].passing).toBeNull();
    expect(seasons[0].rushing).toBeNull();
    expect(seasons[0].receiving).toBeNull();
  });

  it('uses the aggregate 2TM row for multi-team seasons (last row wins)', () => {
    const seasons = parseMainPageSeasonTotals(K_HTML, kicker);

    const s2023 = seasons.find((s) => s.kicking?.season === 2023);
    expect(s2023?.kicking).toMatchObject({
      season: 2023,
      // aggregate row: g=17, fgm=28, fga=30, xpm=35, xpa=36
      g: 17,
      fgm: 28,
      fga: 30,
      xpm: 35,
      xpa: 36,
    });
  });

  it('skips Career totals row', () => {
    const seasons = parseMainPageSeasonTotals(K_HTML, kicker);
    expect(seasons.map((s) => s.kicking?.season)).toEqual([2021, 2022, 2023]);
  });
});

describe('parseMainPageSeasonTotals — empty page', () => {
  it('returns empty array when no relevant tables are present', () => {
    const seasons = parseMainPageSeasonTotals('<html><body></body></html>', wr);
    expect(seasons).toHaveLength(0);
  });
});

describe('getAllSeasonTotalsFromMainPage', () => {
  it('fetches player main page and delegates to parser', async () => {
    mockGetPlayerPage.mockResolvedValue(WR_HTML);
    const seasons = await getAllSeasonTotalsFromMainPage(wr);

    expect(mockGetPlayerPage).toHaveBeenCalledWith('AdamDa01');
    expect(seasons).toHaveLength(2);
    expect(seasons[0].receiving?.season).toBe(2014);
  });
});

describe('parseMainPageDefenseSeasonTotals — IDP (comment-wrapped defense table)', () => {
  it('parses every non-empty defensive stat from the comment-wrapped table', () => {
    const seasons = parseMainPageDefenseSeasonTotals(IDP_HTML, idp);

    // 2014, 2015, 2016 — the Career row is filtered out by the year guard.
    expect(seasons.map((s) => s.season)).toEqual([2014, 2015, 2016]);

    expect(seasons[0]).toMatchObject({
      playerId: 50,
      season: 2014,
      team: 'PHI',
      pfrRowId: '2014',
      g: 16,
      gs: 15,
      soloTkl: 60,
      astTkl: 25,
      totalTkl: 85,
      sacks: 1.5,
      int: 3,
      pd: 10,
      ff: 2,
      fr: 1,
      // No unified def_td column: def_int_td(1) + fumbles_rec_td(0).
      defTd: 1,
      safeties: 0,
    });
  });

  it('collapses a multi-team season to the aggregate 2TM row (last row wins)', () => {
    const seasons = parseMainPageDefenseSeasonTotals(IDP_HTML, idp);
    const s2015 = seasons.find((s) => s.season === 2015);

    expect(s2015).toMatchObject({
      team: '2TM',
      g: 16,
      gs: 14,
      soloTkl: 60,
      astTkl: 25,
      totalTkl: 85,
      sacks: 3,
      int: 3,
      pd: 12,
      ff: 3,
      fr: 2,
      // def_int_td(1) + fumbles_rec_td(1).
      defTd: 2,
      safeties: 1,
    });
  });

  it('falls back to solo+ast when tackles_combined is absent', () => {
    const seasons = parseMainPageDefenseSeasonTotals(IDP_HTML, idp);
    const s2016 = seasons.find((s) => s.season === 2016);

    // The 2016 row omits tackles_combined → totalTkl = soloTkl + astTkl.
    expect(s2016).toMatchObject({
      team: 'NWE',
      soloTkl: 50,
      astTkl: 20,
      totalTkl: 70,
      sacks: 0,
      int: 0,
      defTd: 0,
    });
  });

  it('returns an empty array when no defense table is present', () => {
    const seasons = parseMainPageDefenseSeasonTotals(
      '<html><body></body></html>',
      idp,
    );
    expect(seasons).toHaveLength(0);
  });

  // LS-7755: PFR renders a "missed season" as a note row whose team cell holds
  // free text ("Did not play - Injured (knee)") with every stat blank. The
  // parser must skip it — otherwise the note lands in `team`, the blank-stat
  // upsert fails, and the player's entire batch of valid seasons is dropped.
  it('skips a "Did not play" note row interleaved among real seasons', () => {
    const seasons = parseMainPageDefenseSeasonTotals(
      IDP_MISSED_SEASON_HTML,
      idp,
    );

    // Only the two real seasons survive; the 1975 note row is skipped.
    expect(seasons.map((s) => s.season)).toEqual([1974, 1976]);
    // No row carries the note text in `team`, and every surviving row reports
    // games played.
    for (const s of seasons) {
      expect(s.team).not.toMatch(/did not play/i);
      expect(s.g).not.toBeNull();
    }
    expect(seasons[0]).toMatchObject({
      season: 1974,
      team: 'NYG',
      g: 14,
      totalTkl: 70,
      sacks: 3,
    });
  });
});

describe('getAllDefenseSeasonTotalsFromMainPage', () => {
  it('fetches player main page and delegates to the defense parser', async () => {
    mockGetPlayerPage.mockResolvedValue(IDP_HTML);
    const seasons = await getAllDefenseSeasonTotalsFromMainPage(idp);

    expect(mockGetPlayerPage).toHaveBeenCalledWith('TestLb00');
    expect(seasons).toHaveLength(3);
    expect(seasons[0].season).toBe(2014);
  });
});
