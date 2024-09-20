import htmlParser, { HTMLElement, Node, NodeType } from 'node-html-parser';

function checkChildrenForTable(
  node: Node,
  tableId: string
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
  tableId: string
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
