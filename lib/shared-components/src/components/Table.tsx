import React from 'react';
import { Text, XStack, YStack } from 'tamagui';

export interface TableColumn {
  key: string;
  label: string;
  /** Right-align + tabular-nums */
  numeric?: boolean;
  /** Show sort indicator arrow */
  sorted?: boolean;
}

export interface TableCellValue {
  value: string | number | null;
  /** Highlight value in brand gold */
  lead?: boolean;
  /** Custom render override */
  render?: () => React.ReactNode;
}

export type TableCellData = string | number | null | TableCellValue;

export interface TableProps {
  columns: TableColumn[];
  rows: TableCellData[][];
  title?: string;
}

function resolveCellValue(cell: TableCellData): {
  raw: string | number | null;
  lead: boolean;
  render?: () => React.ReactNode;
} {
  if (cell === null || typeof cell !== 'object') {
    return { raw: cell, lead: false };
  }
  return { raw: cell.value, lead: !!cell.lead, render: cell.render };
}

function HeaderCell({ column }: { column: TableColumn }) {
  return (
    <XStack
      tag="th"
      // `scope` is omitted from Tamagui's stack prop types; spread it so the
      // attribute reaches the DOM (see LeagueDetailShell.tsx:310).
      {...{ scope: 'col' }}
      role="columnheader"
      flex={1}
      justifyContent={column.numeric ? 'flex-end' : 'flex-start'}
      paddingHorizontal={14}
      paddingVertical={12}
      aria-sort={column.sorted ? 'descending' : undefined}
    >
      <Text
        fontFamily="$heading"
        fontWeight="700"
        fontSize={11}
        letterSpacing={1.4}
        textTransform="uppercase"
        color="$textMuted"
        textAlign={column.numeric ? 'right' : 'left'}
      >
        {column.label}
        {column.sorted ? (
          <Text color="$brandGoldLight" fontSize={11}>
            {' ▾'}
          </Text>
        ) : null}
      </Text>
    </XStack>
  );
}

function DataCell({
  cell,
  column,
  isLast,
}: {
  cell: TableCellData;
  column: TableColumn;
  isLast: boolean;
}) {
  const { raw, lead, render } = resolveCellValue(cell);
  const content = render ? (
    render()
  ) : (
    <Text
      fontFamily="$mono"
      fontSize={13}
      color={lead ? '$brandGoldLight' : '$color'}
      textAlign={column.numeric ? 'right' : 'left'}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {raw === null ? '—' : String(raw)}
    </Text>
  );

  return (
    <XStack
      tag="td"
      role="cell"
      flex={1}
      justifyContent={column.numeric ? 'flex-end' : 'flex-start'}
      paddingHorizontal={14}
      paddingVertical={11}
      borderBottomWidth={isLast ? 0 : 1}
      borderColor="$outlineSubtle"
    >
      {content}
    </XStack>
  );
}

export function Table({ columns, rows, title }: TableProps): React.JSX.Element {
  return (
    // Emit real <table>/<caption>/<thead>/<tbody>/<tr>/<th>/<td> on web via the
    // Tamagui `tag` prop (it survives the optimizing compiler; `role` is
    // stripped from the prod build — LS-7861). `role` is kept for native screen
    // readers. Layout is unchanged — `tag` only sets the DOM element name.
    <YStack
      tag="table"
      role="table"
      aria-label={title}
      backgroundColor="$surfacePanel"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      borderRadius={16}
      overflow="hidden"
      width="100%"
    >
      {title ? (
        <XStack
          tag="caption"
          paddingHorizontal={14}
          paddingVertical={12}
          borderBottomWidth={1}
          borderColor="$outlineStrong"
        >
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={16}
            color="$color12"
            letterSpacing={-0.1}
          >
            {title}
          </Text>
        </XStack>
      ) : null}

      {/* Header — <thead><tr> on web, role="rowgroup"/"row" for native */}
      <XStack tag="thead" role="rowgroup">
        <XStack
          tag="tr"
          role="row"
          flex={1}
          backgroundColor="$surfaceCard"
          borderBottomWidth={1}
          borderColor="$outlineStrong"
        >
          {columns.map((col) => (
            <HeaderCell key={col.key} column={col} />
          ))}
        </XStack>
      </XStack>

      {/* Body — <tbody> on web, role="rowgroup" for native */}
      <YStack tag="tbody" role="rowgroup">
        {rows.map((row, rowIdx) => (
          <XStack
            key={rowIdx}
            tag="tr"
            role="row"
            hoverStyle={{ backgroundColor: '$surfaceInteractive' }}
          >
            {columns.map((col, colIdx) => (
              <DataCell
                key={col.key}
                cell={row[colIdx] ?? null}
                column={col}
                isLast={rowIdx === rows.length - 1}
              />
            ))}
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}
