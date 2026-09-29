import { buildSeasonPayloads } from './payloads';
import type { CsvRow } from './transform';
import { RETROSHEET_PAYLOAD_VERSION } from './types';

const RETRO_TO_BREF = new Map([
  ['freef001', 'freemfr01'],
  ['relif001', 'relieve01'],
  ['glovf001', 'glovefi01'],
]);

function battingRow(
  id: string,
  gid: string,
  gametype: string,
  extra: CsvRow = {},
): CsvRow {
  return {
    gid,
    id,
    stattype: 'value',
    date: gid.slice(3, 11),
    gametype,
    b_pa: '4',
    b_h: '1',
    ...extra,
  };
}

function pitchingRow(id: string, gid: string, gametype: string): CsvRow {
  return {
    gid,
    id,
    stattype: 'value',
    date: gid.slice(3, 11),
    gametype,
    p_ipouts: '3',
  };
}

function fieldingRow(id: string, gid: string, gametype: string): CsvRow {
  return {
    gid,
    id,
    stattype: 'value',
    date: gid.slice(3, 11),
    gametype,
    d_pos: '3',
    d_po: '1',
  };
}

// freemfr01/2024 in miniature: a regular-season game, the All-Star game, and
// a World Series game.
const REGULAR_GID = 'LAN202409290';
const ALLSTAR_GID = 'ALS202407160';
const WORLD_SERIES_GID = 'NYA202410300';

describe('buildSeasonPayloads', () => {
  it('stamps the current payload version', () => {
    const { payloads } = buildSeasonPayloads(
      2024,
      [battingRow('freef001', REGULAR_GID, 'regular')],
      [],
      [],
      RETRO_TO_BREF,
    );
    expect(payloads[0].v).toBe(RETROSHEET_PAYLOAD_VERSION);
  });

  it('excludes postseason and All-Star rows from every stat family', () => {
    const { payloads } = buildSeasonPayloads(
      2024,
      [
        battingRow('freef001', REGULAR_GID, 'regular'),
        battingRow('freef001', ALLSTAR_GID, 'allstar'),
        battingRow('freef001', WORLD_SERIES_GID, 'worldseries'),
        battingRow('freef001', 'LAN202410050', 'divisionseries'),
        battingRow('freef001', 'LAN202410130', 'lcs'),
        battingRow('freef001', 'SDN202410010', 'wildcard'),
      ],
      [],
      [
        fieldingRow('freef001', REGULAR_GID, 'regular'),
        fieldingRow('freef001', ALLSTAR_GID, 'allstar'),
        fieldingRow('freef001', WORLD_SERIES_GID, 'worldseries'),
      ],
      RETRO_TO_BREF,
    );

    expect(payloads).toHaveLength(1);
    const [payload] = payloads;
    expect(payload.batting.map((row) => row.gameIdentifier)).toEqual([
      REGULAR_GID,
    ]);
    expect(payload.fielding.map((row) => row.gameIdentifier)).toEqual([
      REGULAR_GID,
    ]);
  });

  it('keeps tiebreaker ("playoff") games, which count as regular season', () => {
    const { payloads } = buildSeasonPayloads(
      1978,
      [
        battingRow('freef001', 'BOS197810010', 'regular'),
        battingRow('freef001', 'BOS197810020', 'playoff'),
      ],
      [],
      [],
      RETRO_TO_BREF,
    );
    expect(payloads[0].batting.map((row) => row.gameIdentifier)).toEqual([
      'BOS197810010',
      'BOS197810020',
    ]);
  });

  it('numbers games over the regular season only', () => {
    // The All-Star game sits mid-season, so counting it would shift every
    // later game's number by one.
    const { payloads } = buildSeasonPayloads(
      2024,
      [
        battingRow('freef001', 'LAN202407140', 'regular'),
        battingRow('freef001', ALLSTAR_GID, 'allstar'),
        battingRow('freef001', 'LAN202407190', 'regular'),
      ],
      [],
      [],
      RETRO_TO_BREF,
    );
    expect(
      payloads[0].batting.map((row) => [row.gameIdentifier, row.gameNum]),
    ).toEqual([
      ['LAN202407140', 1],
      ['LAN202407190', 2],
    ]);
  });

  it('writes no payload for a player who only appeared in the postseason', () => {
    const { payloads } = buildSeasonPayloads(
      2024,
      [battingRow('freef001', WORLD_SERIES_GID, 'worldseries')],
      [pitchingRow('relif001', WORLD_SERIES_GID, 'worldseries')],
      [fieldingRow('freef001', WORLD_SERIES_GID, 'worldseries')],
      RETRO_TO_BREF,
    );
    expect(payloads).toEqual([]);
  });

  it('writes no payload whose batting and pitching are both empty', () => {
    const { payloads, empty } = buildSeasonPayloads(
      2024,
      [battingRow('freef001', REGULAR_GID, 'regular')],
      [],
      // A fielding-only regular-season appearance: no batting, no pitching.
      [fieldingRow('glovf001', REGULAR_GID, 'regular')],
      RETRO_TO_BREF,
    );
    expect(payloads.map((payload) => payload.brefId)).toEqual(['freemfr01']);
    expect([...empty]).toEqual(['glovefi01']);
  });

  it('writes a pitcher-only payload (batting empty, pitching not)', () => {
    const { payloads, empty } = buildSeasonPayloads(
      2024,
      [],
      [pitchingRow('relif001', REGULAR_GID, 'regular')],
      [],
      RETRO_TO_BREF,
    );
    expect(payloads.map((payload) => payload.brefId)).toEqual(['relieve01']);
    expect(empty.size).toBe(0);
  });

  it('reports players with no crosswalk entry as unmapped', () => {
    const { payloads, unmapped } = buildSeasonPayloads(
      2024,
      [battingRow('nobod001', REGULAR_GID, 'regular')],
      [],
      [],
      RETRO_TO_BREF,
    );
    expect(payloads).toEqual([]);
    expect([...unmapped]).toEqual(['nobod001']);
  });
});
