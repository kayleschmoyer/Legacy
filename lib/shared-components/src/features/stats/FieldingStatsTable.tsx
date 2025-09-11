import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from '../../platform-components';

const TABLE_HEADER = [
  'Player',
  'A',
  'CG',
  'Chances',
  'CS',
  'DP Def',
  'E Def',
  'G',
  'GS',
  'Inn Def',
  'Pickoffs',
  'PO',
  'Pos',
  'SB',
  'WP',
];

// Generic fielding stats interface to avoid GraphQL dependencies
export interface FieldingStatsRecord {
  player?: {
    name?: string | null;
  } | null;
  a?: number | null;
  cg?: number | null;
  chances?: number | null;
  cs?: number | null;
  dpDef?: number | null;
  eDef?: number | null;
  g?: number | null;
  gs?: number | null;
  innDef?: number | null;
  pickoffs?: number | null;
  po?: number | null;
  pos?: string | null;
  sb?: number | null;
  wp?: number | null;
}

export interface FieldingStatsTableProps {
  stats: readonly FieldingStatsRecord[];
}

export function FieldingStatsTable({
  stats,
}: FieldingStatsTableProps): JSX.Element {
  const data = useMemo(() => {
    return stats.map((record) => [
      record.player?.name || 'Unknown',
      record.a?.toString() || '0',
      record.cg?.toString() || '0',
      record.chances?.toString() || '0',
      record.cs?.toString() || '0',
      record.dpDef?.toString() || '0',
      record.eDef?.toString() || '0',
      record.g?.toString() || '0',
      record.gs?.toString() || '0',
      record.innDef?.toString() || '0',
      record.pickoffs?.toString() || '0',
      record.po?.toString() || '0',
      record.pos || '',
      record.sb?.toString() || '0',
      record.wp?.toString() || '0',
    ]);
  }, [stats]);

  return (
    <ScrollView horizontal style={styles.container}>
      <View style={styles.table}>
        {/* Header */}
        <View style={styles.row}>
          {TABLE_HEADER.map((header, index) => (
            <View key={index} style={styles.headerCell}>
              <Text style={styles.headerText}>{header}</Text>
            </View>
          ))}
        </View>

        {/* Data Rows */}
        {data.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((cell, cellIndex) => (
              <View key={cellIndex} style={styles.cell}>
                <Text style={styles.cellText}>{cell}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  table: {
    backgroundColor: '#1E1E1E',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerCell: {
    width: 80,
    padding: 12,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#444',
  },
  cell: {
    width: 80,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#333',
  },
  headerText: {
    color: '#FFD700',
    fontWeight: 'bold',
    fontSize: 12,
    textAlign: 'center',
  },
  cellText: {
    color: '#FFFFFF',
    fontSize: 11,
    textAlign: 'center',
  },
});
