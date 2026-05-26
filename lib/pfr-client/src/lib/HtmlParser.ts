import htmlParser, { HTMLElement, Node, NodeType } from 'node-html-parser';

function checkChildrenForTable(
  node: Node,
  tableId: string,
): HTMLElement | null {
  let table: HTMLElement | null = null;

  if (node.nodeType === NodeType.COMMENT_NODE) {
    const commentBody = htmlParser(node.text, { comment: true });

    table = commentBody.getElementById(tableId);

    if (table !== null) {
      return table;
    }
  }

  for (const n of node.childNodes) {
    table = checkChildrenForTable(n, tableId);
    if (table !== null) {
      return table;
    }
  }

  return table;
}

export function getTable(
  root: HTMLElement,
  tableId: string,
): HTMLElement | null {
  const table = root.getElementById(tableId);

  if (table !== null) {
    return table;
  }

  return checkChildrenForTable(root, tableId);
}

export function getTableBody(table: HTMLElement): HTMLElement | undefined {
  return table.getElementsByTagName('tbody')[0];
}

export function getTableFooter(table: HTMLElement): HTMLElement | undefined {
  return table.getElementsByTagName('tfoot')[0];
}

export type RowParser<T> = (row: HTMLElement) => T | null;

export function parseTableRows<T>(
  table: HTMLElement | null,
  parser: RowParser<T>,
): T[] {
  if (table === null) {
    return [];
  }

  const body = getTableBody(table);

  if (body === undefined) {
    return [];
  }

  const result: T[] = [];

  for (const row of body.getElementsByTagName('tr')) {
    const record = parser(row);
    if (record !== null) {
      result.push(record);
    }
  }

  return result;
}

export function parseFooterRow<T>(
  table: HTMLElement | null,
  parser: RowParser<T>,
): T | null {
  if (table === null) {
    return null;
  }

  const footer = getTableFooter(table);

  if (footer === undefined) {
    return null;
  }

  for (const row of footer.getElementsByTagName('tr')) {
    const record = parser(row);
    if (record !== null) {
      return record;
    }
  }

  return null;
}

export function getCellText(row: HTMLElement, dataStat: string): string | null {
  const cell =
    row
      .getElementsByTagName('td')
      .find((c) => c.getAttribute('data-stat') === dataStat) ??
    row
      .getElementsByTagName('th')
      .find((c) => c.getAttribute('data-stat') === dataStat);

  if (cell === undefined) {
    return null;
  }

  const text = cell.text.trim();
  return text === '' ? null : text;
}

export function parseIntCell(
  row: HTMLElement,
  dataStat: string,
): number | null {
  const text = getCellText(row, dataStat);
  if (text === null) return null;
  const n = parseInt(text, 10);
  return isNaN(n) ? null : n;
}

export function parseFloatCell(
  row: HTMLElement,
  dataStat: string,
): number | null {
  const text = getCellText(row, dataStat);
  if (text === null) return null;
  const n = parseFloat(text);
  return isNaN(n) ? null : n;
}

// PFR box score URL pattern: /boxscores/202409080kan.htm → 202409080kan
const GAME_ID_REGEX = /\/boxscores\/(\w+)\.htm$/;

export function parseGameIdentifier(row: HTMLElement): string | null {
  const dateCell = row
    .getElementsByTagName('td')
    .find((c) => c.getAttribute('data-stat') === 'game_date');
  const link = dateCell?.getElementsByTagName('a')[0]?.getAttribute('href');
  const match = link?.match(GAME_ID_REGEX);
  return match ? match[1] : null;
}

export function parseGameNum(row: HTMLElement): number | null {
  const ranker =
    row
      .getElementsByTagName('th')
      .find((c) => c.getAttribute('data-stat') === 'ranker') ??
    row
      .getElementsByTagName('td')
      .find((c) => c.getAttribute('data-stat') === 'ranker');
  if (!ranker) return null;
  const text = ranker.text.trim();
  if (text === 'Rk' || text === '') return null;
  const n = parseInt(text, 10);
  return isNaN(n) ? null : n;
}

export function parseTeamCell(row: HTMLElement): string | null {
  const cell = row
    .getElementsByTagName('td')
    .find((c) => c.getAttribute('data-stat') === 'team');
  if (!cell) return null;
  const anchor = cell.getElementsByTagName('a')[0];
  const text = (anchor?.text ?? cell.text).trim();
  return text === '' ? null : text;
}
