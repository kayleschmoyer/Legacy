import React, { useMemo, useState } from 'react';
import { Button, ScrollView, Text, XStack, YStack } from 'tamagui';
import { Platform } from '../../platform-components';
import { StatsTableColumn, StatsTableRow } from '../../types';

export interface StatsTableProps {
  columns: StatsTableColumn[];
  data: StatsTableRow[];
  title?: string;
  sortable?: boolean;
  maxHeight?: number;
  onRowPress?: (row: StatsTableRow, index: number) => void;
}

function StatsTable({
  columns,
  data,
  title,
  sortable = true,
  maxHeight = 400,
  onRowPress,
}: StatsTableProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const sortedData = useMemo(() => {
    if (!sortColumn || !sortable) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === undefined || bVal === undefined) return 0;

      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection, sortable]);

  const handleSort = (columnKey: string) => {
    if (!sortable) return;

    const column = columns.find((col) => col.key === columnKey);
    if (!column?.sortable) return;

    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const getSortIndicator = (columnKey: string) => {
    if (sortColumn !== columnKey) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  const renderHeader = () => (
    <XStack
      backgroundColor="$secondary"
      borderBottomWidth={2}
      borderBottomColor="$accent"
    >
      {columns.map((column) => (
        <Button
          key={column.key}
          flex={1}
          paddingVertical="$3"
          paddingHorizontal="$2"
          justifyContent="center"
          minHeight={40}
          backgroundColor="transparent"
          borderWidth={0}
          onPress={() => handleSort(column.key)}
          disabled={!sortable || !column.sortable}
        >
          <Text
            color="$text"
            fontSize="$3"
            fontWeight="bold"
            textAlign="center"
            {...(Platform.OS === 'web' && {
              fontFamily: 'system-ui, -apple-system, sans-serif',
            })}
          >
            {column.label}
            {getSortIndicator(column.key)}
          </Text>
        </Button>
      ))}
    </XStack>
  );

  const renderRow = (row: StatsTableRow, index: number) => (
    <Button
      key={row.id}
      flexDirection="row"
      borderBottomWidth={1}
      borderBottomColor="$border"
      backgroundColor={index % 2 === 0 ? '$primary' : '$secondary'}
      onPress={() => onRowPress?.(row, index)}
      disabled={!onRowPress}
      borderWidth={0}
      borderRadius={0}
    >
      {columns.map((column) => (
        <YStack
          key={column.key}
          paddingVertical="$2.5"
          paddingHorizontal="$2"
          justifyContent="center"
          minHeight={36}
          flex={1}
        >
          <Text
            color="$textSecondary"
            fontSize="$2"
            textAlign="center"
            numberOfLines={1}
            {...(Platform.OS === 'web' && {
              fontFamily: 'system-ui, -apple-system, sans-serif',
            })}
          >
            {String(row[column.key] ?? '')}
          </Text>
        </YStack>
      ))}
    </Button>
  );

  return (
    <YStack
      backgroundColor="$primary"
      borderRadius="$3"
      overflow="hidden"
      marginVertical="$3"
    >
      {title && (
        <YStack
          backgroundColor="$accent"
          paddingVertical="$3"
          paddingHorizontal="$4"
        >
          <Text
            color="$text"
            fontSize="$6"
            fontWeight="bold"
            textAlign="center"
            {...(Platform.OS === 'web' && {
              fontFamily: 'system-ui, -apple-system, sans-serif',
            })}
          >
            {title}
          </Text>
        </YStack>
      )}

      <YStack flex={1}>
        {renderHeader()}

        <ScrollView
          flex={1}
          maxHeight={maxHeight}
          showsVerticalScrollIndicator={true}
        >
          {sortedData.map((row, index) => renderRow(row, index))}
        </ScrollView>
      </YStack>
    </YStack>
  );
}

export { StatsTable };
