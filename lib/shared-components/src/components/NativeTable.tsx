import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { TableProps } from './LazyTable';

// Native table implementation using basic React Native components
const NativeTable: React.FC<TableProps> = ({ headers, data, title, style }) => {
  return (
    <View style={[styles.container, style]}>
      {title && <Text style={styles.title}>{title}</Text>}

      {/* Header Row */}
      <View style={styles.headerRow}>
        {headers.map((header, index) => (
          <View key={index} style={[styles.headerCell, { flex: 1 }]}>
            <Text style={styles.headerText}>{header}</Text>
          </View>
        ))}
      </View>

      {/* Data Rows */}
      {data.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.dataRow}>
          {row.map((cell, cellIndex) => (
            <View key={cellIndex} style={[styles.dataCell, { flex: 1 }]}>
              <Text style={styles.cellText}>{cell}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 2,
    borderBottomColor: '#ddd',
  },
  headerCell: {
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: '#ddd',
  },
  headerText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  dataCell: {
    padding: 10,
    borderRightWidth: 1,
    borderRightColor: '#eee',
  },
  cellText: {
    fontSize: 13,
  },
});

export default NativeTable;
