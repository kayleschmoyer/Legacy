import React, { Suspense, lazy } from 'react';
import { Platform, View, Text } from 'react-native';

// Platform-specific table implementations
const NativeTable = lazy(() => import('./NativeTable'));
const WebTable = lazy(() => import('./WebTable'));

export interface TableProps {
  headers: string[];
  data: Array<Array<string | number>>;
  title?: string;
  style?: any;
}

// Loading fallback component
const TableFallback = () => (
  <View style={{ padding: 16, alignItems: 'center' }}>
    <Text>Loading table...</Text>
  </View>
);

// Cross-platform table component
export const LazyTable: React.FC<TableProps> = (props) => {
  if (Platform.OS === 'web') {
    return (
      <Suspense fallback={<TableFallback />}>
        <WebTable {...props} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<TableFallback />}>
      <NativeTable {...props} />
    </Suspense>
  );
};

export default LazyTable;
