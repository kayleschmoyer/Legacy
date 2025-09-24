import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import type { TableProps } from './LazyTable';

// Native table implementation using Tamagui components
const NativeTable: React.FC<TableProps> = ({ headers, data, title, style }) => {
  return (
    <YStack
      marginBottom="$4"
      borderWidth={1}
      borderColor="$gray7"
      borderRadius="$2"
      style={style}
    >
      {title && (
        <Text
          fontSize="$6"
          fontWeight="bold"
          padding="$3"
          backgroundColor="$gray2"
          borderBottomWidth={1}
          borderBottomColor="$gray7"
        >
          {title}
        </Text>
      )}

      {/* Header Row */}
      <XStack
        backgroundColor="$gray3"
        borderBottomWidth={2}
        borderBottomColor="$gray7"
      >
        {headers.map((header, index) => (
          <YStack
            key={index}
            flex={1}
            padding="$3"
            borderRightWidth={1}
            borderRightColor="$gray7"
          >
            <Text fontWeight="bold" fontSize="$4">
              {header}
            </Text>
          </YStack>
        ))}
      </XStack>

      {/* Data Rows */}
      {data.map((row, rowIndex) => (
        <XStack key={rowIndex} borderBottomWidth={1} borderBottomColor="$gray5">
          {row.map((cell, cellIndex) => (
            <YStack
              key={cellIndex}
              flex={1}
              padding="$2.5"
              borderRightWidth={1}
              borderRightColor="$gray5"
            >
              <Text fontSize="$3">{cell}</Text>
            </YStack>
          ))}
        </XStack>
      ))}
    </YStack>
  );
};

export default NativeTable;
