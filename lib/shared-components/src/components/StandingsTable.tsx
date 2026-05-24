import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { formatPoints } from '../utils/scoreFormatting';
import { TABULAR_NUMS } from '../utils/typography';

export interface StandingsRow {
  rank: number;
  teamAbbr: string;
  teamName: string;
  wins: number;
  losses: number;
  ties?: number;
  pct: string;
  pf: number;
  pa: number;
  /** "W3", "L1", etc. */
  streak?: string;
  /** Dim avatar and italicize name for teams on bye week. */
  onBye?: boolean;
}

export interface StandingsTableProps {
  rows: StandingsRow[];
  label?: string;
}

const STREAK_WIN = '#6fd39a';
const STREAK_LOSS = '#e07a8c';

const HCell = ({
  children,
  width,
  flex,
  align = 'left',
}: {
  children?: React.ReactNode;
  width?: number;
  flex?: number;
  align?: 'left' | 'right';
}) => (
  <Text
    width={width as never}
    flex={flex as never}
    fontFamily="$heading"
    fontWeight="700"
    fontSize={10}
    letterSpacing={1.0}
    textTransform="uppercase"
    color="$textMuted"
    textAlign={align}
  >
    {children}
  </Text>
);

const DCell = ({
  children,
  width,
  flex,
  align = 'left',
  color = '$color11',
}: {
  children: React.ReactNode;
  width?: number;
  flex?: number;
  align?: 'left' | 'right';
  color?: string;
}) => (
  <Text
    width={width as never}
    flex={flex as never}
    fontFamily="$mono"
    fontSize={13}
    color={color as never}
    textAlign={align}
    {...TABULAR_NUMS}
  >
    {children}
  </Text>
);

export function StandingsTable({
  rows,
  label,
}: StandingsTableProps): React.JSX.Element {
  return (
    <YStack width="100%">
      {label ? (
        <Text
          fontFamily="$heading"
          fontWeight="700"
          fontSize={11}
          letterSpacing={1.4}
          textTransform="uppercase"
          color="$textMuted"
          marginBottom={8}
        >
          {label}
        </Text>
      ) : null}

      <YStack
        borderRadius={16}
        borderWidth={1}
        borderColor="$surfacePanelBorder"
        backgroundColor="$surfacePanel"
        overflow="hidden"
        width="100%"
      >
        {/* Header */}
        <XStack
          paddingHorizontal={14}
          paddingVertical={12}
          backgroundColor="$surfaceCard"
          borderBottomWidth={1}
          borderBottomColor="$outlineStrong"
          alignItems="center"
        >
          <HCell width={24} />
          <HCell flex={1}>Team</HCell>
          <HCell width={72} align="right">
            W-L-T
          </HCell>
          <HCell width={48} align="right">
            PCT
          </HCell>
          <HCell width={72} align="right">
            PF
          </HCell>
          <HCell width={72} align="right">
            PA
          </HCell>
          <HCell width={36} align="right">
            Strk
          </HCell>
        </XStack>

        {/* Rows */}
        <YStack>
          {rows.map((r, i) => {
            const leader = r.rank === 1;
            const last = i === rows.length - 1;
            const streakColor = r.streak?.startsWith('W')
              ? STREAK_WIN
              : r.streak?.startsWith('L')
                ? STREAK_LOSS
                : undefined;

            return (
              <XStack
                key={`${r.rank}-${r.teamAbbr}`}
                paddingHorizontal={14}
                paddingVertical={12}
                alignItems="center"
                borderBottomWidth={last ? 0 : 1}
                borderBottomColor="$outlineSubtle"
                hoverStyle={{ backgroundColor: '$surfaceInteractive' }}
                animation="quick"
              >
                {/* Rank */}
                <Text
                  width={24}
                  fontFamily="$heading"
                  fontWeight="800"
                  fontSize={leader ? 14 : 13}
                  color={leader ? '$brandGold' : '$textMuted'}
                  textAlign="center"
                >
                  {r.rank}
                </Text>

                {/* Team */}
                <XStack flex={1} alignItems="center" gap={10}>
                  <YStack
                    width={24}
                    height={24}
                    borderRadius={12}
                    backgroundColor={leader ? '$brandGold' : '$brandNavy'}
                    borderWidth={leader ? 1 : 0}
                    borderColor="$brandGold"
                    alignItems="center"
                    justifyContent="center"
                    opacity={r.onBye ? 0.5 : 1}
                  >
                    <Text
                      fontFamily="$heading"
                      fontWeight="800"
                      fontSize={10}
                      color={leader ? '#1A1206' : '$brandGoldLight'}
                      lineHeight={1}
                      textAlign="center"
                    >
                      {r.teamAbbr.substring(0, 2).toUpperCase()}
                    </Text>
                  </YStack>
                  <Text
                    flex={1}
                    fontFamily="$body"
                    fontSize={14}
                    color={r.onBye ? '$color10' : '$color12'}
                    fontStyle={r.onBye ? 'italic' : undefined}
                    numberOfLines={1}
                  >
                    {r.teamName}
                  </Text>
                </XStack>

                {/* W-L-T */}
                <DCell width={72} align="right">
                  {r.wins}-{r.losses}-{r.ties ?? 0}
                </DCell>

                {/* PCT */}
                <DCell width={48} align="right">
                  {r.pct}
                </DCell>

                {/* PF */}
                <DCell width={72} align="right">
                  {formatPoints(r.pf)}
                </DCell>

                {/* PA */}
                <DCell width={72} align="right">
                  {formatPoints(r.pa)}
                </DCell>

                {/* Streak */}
                <DCell
                  width={36}
                  align="right"
                  color={streakColor ?? '$color11'}
                >
                  {r.streak ?? '—'}
                </DCell>
              </XStack>
            );
          })}
        </YStack>
      </YStack>
    </YStack>
  );
}
