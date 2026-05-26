import htmlParser from 'node-html-parser';
import {
  getCellText,
  parseFloatCell,
  parseGameIdentifier,
  parseGameNum,
  parseIntCell,
  parseTeamCell,
} from './HtmlParser';

function makeRow(cellsHtml: string) {
  return htmlParser(
    `<table><tbody><tr>${cellsHtml}</tr></tbody></table>`,
  ).getElementsByTagName('tr')[0];
}

describe('parseGameIdentifier', () => {
  it('extracts game identifier from box score link', () => {
    const row = makeRow(
      '<td data-stat="game_date"><a href="/boxscores/202409080kan.htm">2024-09-08</a></td>',
    );
    expect(parseGameIdentifier(row)).toBe('202409080kan');
  });

  it('returns null for bye week row with no box score link', () => {
    const row = makeRow('<td data-stat="game_date">2024-10-27</td>');
    expect(parseGameIdentifier(row)).toBeNull();
  });

  it('returns null when game_date cell is absent', () => {
    const row = makeRow('<td data-stat="other">value</td>');
    expect(parseGameIdentifier(row)).toBeNull();
  });
});

describe('parseGameNum', () => {
  it('parses game number from th ranker', () => {
    const row = makeRow('<th data-stat="ranker">5</th>');
    expect(parseGameNum(row)).toBe(5);
  });

  it('parses game number from td ranker', () => {
    const row = makeRow('<td data-stat="ranker">12</td>');
    expect(parseGameNum(row)).toBe(12);
  });

  it('returns null for header sentinel Rk', () => {
    const row = makeRow('<th data-stat="ranker">Rk</th>');
    expect(parseGameNum(row)).toBeNull();
  });

  it('returns null for empty ranker cell', () => {
    const row = makeRow('<th data-stat="ranker"></th>');
    expect(parseGameNum(row)).toBeNull();
  });

  it('returns null when ranker cell is absent', () => {
    const row = makeRow('<td data-stat="other">1</td>');
    expect(parseGameNum(row)).toBeNull();
  });
});

describe('parseTeamCell', () => {
  it('extracts team from anchor text', () => {
    const row = makeRow(
      '<td data-stat="team"><a href="/teams/kan/2024.htm">KAN</a></td>',
    );
    expect(parseTeamCell(row)).toBe('KAN');
  });

  it('falls back to cell text when no anchor', () => {
    const row = makeRow('<td data-stat="team">NWE</td>');
    expect(parseTeamCell(row)).toBe('NWE');
  });

  it('returns null for empty cell', () => {
    const row = makeRow('<td data-stat="team"></td>');
    expect(parseTeamCell(row)).toBeNull();
  });

  it('returns null when team cell is absent', () => {
    const row = makeRow('<td data-stat="other">value</td>');
    expect(parseTeamCell(row)).toBeNull();
  });
});

describe('parseIntCell', () => {
  it('parses integer value', () => {
    const row = makeRow('<td data-stat="tackles_solo">7</td>');
    expect(parseIntCell(row, 'tackles_solo')).toBe(7);
  });

  it('returns null for empty cell', () => {
    const row = makeRow('<td data-stat="tackles_solo"></td>');
    expect(parseIntCell(row, 'tackles_solo')).toBeNull();
  });

  it('returns null when cell is absent', () => {
    const row = makeRow('<td data-stat="other">7</td>');
    expect(parseIntCell(row, 'tackles_solo')).toBeNull();
  });
});

describe('parseFloatCell', () => {
  it('parses half-sack float value', () => {
    const row = makeRow('<td data-stat="sacks">0.5</td>');
    expect(parseFloatCell(row, 'sacks')).toBe(0.5);
  });

  it('parses whole sack as float', () => {
    const row = makeRow('<td data-stat="sacks">3.0</td>');
    expect(parseFloatCell(row, 'sacks')).toBe(3);
  });

  it('returns null for empty cell', () => {
    const row = makeRow('<td data-stat="sacks"></td>');
    expect(parseFloatCell(row, 'sacks')).toBeNull();
  });
});

describe('getCellText', () => {
  it('returns text from td by data-stat', () => {
    const row = makeRow('<td data-stat="pass_yds">312</td>');
    expect(getCellText(row, 'pass_yds')).toBe('312');
  });

  it('returns text from th by data-stat', () => {
    const row = makeRow('<th data-stat="ranker">3</th>');
    expect(getCellText(row, 'ranker')).toBe('3');
  });

  it('returns null for empty cell', () => {
    const row = makeRow('<td data-stat="pass_yds"></td>');
    expect(getCellText(row, 'pass_yds')).toBeNull();
  });

  it('returns null when cell is absent', () => {
    const row = makeRow('<td data-stat="other">value</td>');
    expect(getCellText(row, 'pass_yds')).toBeNull();
  });
});
