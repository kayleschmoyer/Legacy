import React, { useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from '../../platform-components';
import { StatsTableColumn, StatsTableRow } from '../../types';
import { DEFAULT_COLORS } from '../../config/sports';
import { safeStyle } from '../../utils/styles';

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
    <View style={styles.headerRow}>
      {columns.map((column) => (
        <TouchableOpacity
          key={column.key}
          style={safeStyle([styles.headerCell, { flex: 1 }])}
          onPress={() => handleSort(column.key)}
          disabled={!sortable || !column.sortable}
        >
          <Text style={styles.headerText}>
            {column.label}
            {getSortIndicator(column.key)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderRow = (row: StatsTableRow, index: number) => (
    <TouchableOpacity
      key={index}
      style={safeStyle([
        styles.dataRow,
        index % 2 === 0 ? styles.evenRow : styles.oddRow,
      ])}
      onPress={() => onRowPress?.(row, index)}
      disabled={!onRowPress}
    >
      {columns.map((column) => (
        <View
          key={column.key}
          style={safeStyle([styles.dataCell, { flex: 1 }])}
        >
          <Text style={styles.dataText} numberOfLines={1}>
            {String(row[column.key] ?? '')}
          </Text>
        </View>
      ))}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {title && (
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{title}</Text>
        </View>
      )}

      <View style={styles.tableContainer}>
        {renderHeader()}

        <ScrollView
          style={safeStyle([styles.scrollContainer, { maxHeight }])}
          showsVerticalScrollIndicator={true}
        >
          {sortedData.map((row, index) => renderRow(row, index))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: DEFAULT_COLORS.primary,
    borderRadius: 8,
    overflow: 'hidden',
    marginVertical: 8,
  },
  titleContainer: {
    backgroundColor: DEFAULT_COLORS.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  title: {
    color: DEFAULT_COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  tableContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: DEFAULT_COLORS.secondary,
    borderBottomWidth: 2,
    borderBottomColor: DEFAULT_COLORS.accent,
  },
  headerCell: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    justifyContent: 'center',
    minHeight: 40,
  },
  headerText: {
    color: DEFAULT_COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  scrollContainer: {
    flex: 1,
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: DEFAULT_COLORS.border,
  },
  evenRow: {
    backgroundColor: DEFAULT_COLORS.primary,
  },
  oddRow: {
    backgroundColor: DEFAULT_COLORS.secondary,
  },
  dataCell: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: 'center',
    minHeight: 36,
  },
  dataText: {
    color: DEFAULT_COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
});

export { StatsTable };
