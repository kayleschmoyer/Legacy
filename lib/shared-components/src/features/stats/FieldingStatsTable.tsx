import React, { useMemo } from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';

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

function FieldingStatsTable({ stats }: FieldingStatsTableProps) {
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
    <ScrollView horizontal flex={1}>
      <YStack backgroundColor="$gray10">
        {/* Header */}
        <XStack>
          {TABLE_HEADER.map((header, index) => (
            <YStack
              key={index}
              width={80}
              padding="$3"
              backgroundColor="$gray8"
              justifyContent="center"
              alignItems="center"
              borderRightWidth={1}
              borderRightColor="$gray7"
            >
              <Text
                color="$yellow10"
                fontWeight="bold"
                fontSize="$2"
                textAlign="center"
              >
                {header}
              </Text>
            </YStack>
          ))}
        </XStack>

        {/* Data Rows */}
        {data.map((row, rowIndex) => (
          <XStack
            key={rowIndex}
            borderBottomWidth={1}
            borderBottomColor="$gray8"
          >
            {row.map((cell, cellIndex) => (
              <YStack
                key={cellIndex}
                width={80}
                padding="$3"
                justifyContent="center"
                alignItems="center"
                borderRightWidth={1}
                borderRightColor="$gray8"
              >
                <Text color="$white" fontSize="$1" textAlign="center">
                  {cell}
                </Text>
              </YStack>
            ))}
          </XStack>
        ))}
      </YStack>
    </ScrollView>
  );
}

export { FieldingStatsTable };
