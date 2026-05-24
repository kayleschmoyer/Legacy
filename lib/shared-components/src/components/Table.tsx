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
      style={{ fontVariantNumeric: 'tabular-nums' } as never}
    >
      {raw === null ? '—' : String(raw)}
    </Text>
  );

  return (
    <XStack
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
    <YStack
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

      {/* Header — role="rowgroup" + role="row" mirrors <thead><tr> semantics */}
      <XStack role="rowgroup">
        <XStack
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

      {/* Body — role="rowgroup" mirrors <tbody> semantics */}
      <YStack role="rowgroup">
        {rows.map((row, rowIdx) => (
          <XStack
            key={rowIdx}
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
