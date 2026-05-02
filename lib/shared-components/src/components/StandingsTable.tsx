import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { Chip } from './Chip';

export interface StandingsRow {
  rank: number;
  teamAbbr: string;
  teamName: string;
  wins: number;
  losses: number;
  ties?: number;
  gamesBack?: number;
  /** "W3", "L1", etc. */
  streak?: string;
}

export interface StandingsTableProps {
  rows: StandingsRow[];
  title?: string;
}

const HCell = ({
  children,
  width,
  align = 'left',
}: {
  children: React.ReactNode;
  width: number | string;
  align?: 'left' | 'right' | 'center';
}) => (
  <Text
    width={width as never}
    fontFamily="$heading"
    fontSize={11}
    fontWeight="700"
    letterSpacing={1.4}
    textTransform="uppercase"
    color="$textMuted"
    textAlign={align}
  >
    {children}
  </Text>
);

const Cell = ({
  children,
  width,
  align = 'left',
  mono = false,
  gold = false,
}: {
  children: React.ReactNode;
  width: number | string;
  align?: 'left' | 'right' | 'center';
  mono?: boolean;
  gold?: boolean;
}) => (
  <Text
    width={width as never}
    fontFamily={mono ? '$mono' : '$body'}
    fontSize={13}
    color={gold ? '$brandGold' : '$color'}
    textAlign={align}
    style={{ fontVariantNumeric: 'tabular-nums' } as never}
  >
    {children}
  </Text>
);

/**
 * Vertical league standings list. The leader row gets the gold-rim
 * treatment per the design handoff.
 */
export function StandingsTable({
  rows,
  title,
}: StandingsTableProps): React.JSX.Element {
  return (
    <YStack
      borderRadius={16}
      borderWidth={1}
      borderColor="$glassBorder"
      backgroundColor="$surfaceCard"
      overflow="hidden"
      width="100%"
    >
      {title ? (
        <XStack padding="$4" borderBottomWidth={1} borderColor="$glassBorder">
          <Text
            fontFamily="$heading"
            fontSize={16}
            fontWeight="800"
            color="$color12"
            letterSpacing={-0.1}
          >
            {title}
          </Text>
        </XStack>
      ) : null}

      <XStack
        paddingHorizontal="$4"
        paddingVertical={10}
        borderBottomWidth={1}
        borderColor="$glassBorder"
      >
        <HCell width={36}>#</HCell>
        <HCell width="40%">Team</HCell>
        <HCell width={48} align="right">
          W
        </HCell>
        <HCell width={48} align="right">
          L
        </HCell>
        <HCell width={56} align="right">
          GB
        </HCell>
        <HCell width={56} align="right">
          Streak
        </HCell>
      </XStack>

      <YStack>
        {rows.map((r, i) => {
          const leader = r.rank === 1;
          return (
            <XStack
              key={r.teamAbbr}
              paddingHorizontal="$4"
              paddingVertical={12}
              alignItems="center"
              backgroundColor={leader ? 'rgba(197,165,90,0.08)' : 'transparent'}
              borderTopWidth={leader ? 1 : 0}
              borderBottomWidth={leader ? 1 : i < rows.length - 1 ? 1 : 0}
              borderColor={leader ? '$brandGold' : '$glassBorder'}
              hoverStyle={{ backgroundColor: '$surfaceInteractive' }}
            >
              <Cell width={36} mono gold={leader}>
                {r.rank}
              </Cell>
              <YStack width="40%">
                <XStack gap="$2" alignItems="baseline">
                  <Text
                    fontFamily="$heading"
                    fontWeight="800"
                    fontSize={14}
                    color={leader ? '$brandGold' : '$color12'}
                    letterSpacing={0.6}
                  >
                    {r.teamAbbr}
                  </Text>
                  <Text
                    fontFamily="$body"
                    fontSize={13}
                    color="$textMuted"
                    numberOfLines={1}
                  >
                    {r.teamName}
                  </Text>
                </XStack>
              </YStack>
              <Cell width={48} align="right" mono>
                {r.wins}
              </Cell>
              <Cell width={48} align="right" mono>
                {r.losses}
                {typeof r.ties === 'number' ? `-${r.ties}` : ''}
              </Cell>
              <Cell width={56} align="right" mono>
                {r.gamesBack === 0 || r.gamesBack === undefined
                  ? '—'
                  : r.gamesBack.toFixed(1)}
              </Cell>
              <XStack width={56} justifyContent="flex-end">
                {r.streak ? (
                  <Chip
                    label={r.streak}
                    size="sm"
                    tone={
                      r.streak.startsWith('W')
                        ? 'success'
                        : r.streak.startsWith('L')
                          ? 'seam'
                          : 'neutral'
                    }
                  />
                ) : null}
              </XStack>
            </XStack>
          );
        })}
      </YStack>
    </YStack>
  );
}
