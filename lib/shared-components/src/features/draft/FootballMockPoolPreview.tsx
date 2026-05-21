/**
 * Football mock pool preview.
 *
 * Visual summary of the football mock player pool seeded in
 * `@legacy-sports/test-fixtures`. Used by `MockDraftPage` (behind the
 * `football-mock-players` feature flag) and by Storybook to verify the
 * pool shape end-to-end before the sport-aware draft engine ships.
 */
import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  type FixtureFootballPlayer,
  fixtureFootballPlayers,
  type FootballPosition,
} from '@legacy-sports/test-fixtures';

interface FootballMockPoolPreviewProps {
  /**
   * Football pool to summarize. Defaults to `fixtureFootballPlayers` from
   * `@legacy-sports/test-fixtures`, which is the canonical mock pool until
   * the real football stats pipeline ships.
   */
  pool?: readonly FixtureFootballPlayer[];
  /** How many top-FPG players to show per position. Defaults to 3. */
  topPerPosition?: number;
}

const POSITION_ORDER: readonly FootballPosition[] = [
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DEF',
];

function groupByPosition(
  pool: readonly FixtureFootballPlayer[],
): Record<FootballPosition, FixtureFootballPlayer[]> {
  const groups: Record<FootballPosition, FixtureFootballPlayer[]> = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
    K: [],
    DEF: [],
  };
  for (const p of pool) groups[p.position].push(p);
  for (const key of POSITION_ORDER) {
    groups[key].sort((a, b) => b.fpg - a.fpg);
  }
  return groups;
}

export function FootballMockPoolPreview({
  pool = fixtureFootballPlayers,
  topPerPosition = 3,
}: FootballMockPoolPreviewProps): React.JSX.Element {
  const grouped = React.useMemo(() => groupByPosition(pool), [pool]);

  return (
    <YStack
      gap="$3"
      padding="$4"
      borderRadius="$4"
      borderWidth={1}
      borderColor="$borderColor"
      backgroundColor="$color2"
      data-testid="football-mock-pool-preview"
    >
      <XStack justifyContent="space-between" alignItems="center">
        <Text
          fontFamily="$display"
          fontSize={16}
          fontWeight="700"
          color="$color"
          textTransform="uppercase"
          letterSpacing={1}
        >
          Football Mock Pool
        </Text>
        <Text
          fontFamily="$body"
          fontSize={13}
          color="$gray11"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {pool.length} players
        </Text>
      </XStack>

      <YStack gap="$2">
        {POSITION_ORDER.map((pos) => {
          const top = grouped[pos].slice(0, topPerPosition);
          return (
            <YStack key={pos} gap="$1.5">
              <XStack alignItems="center" gap="$2">
                <Text
                  fontFamily="$display"
                  fontSize={13}
                  fontWeight="700"
                  color="$color"
                  width={36}
                >
                  {pos}
                </Text>
                <Text fontFamily="$body" fontSize={12} color="$gray11">
                  {grouped[pos].length} total
                </Text>
              </XStack>
              {top.map((player) => (
                <XStack
                  key={player.id}
                  justifyContent="space-between"
                  paddingLeft="$4"
                  data-testid={`football-pool-player-${player.id}`}
                >
                  <Text fontFamily="$body" fontSize={13} color="$color">
                    {player.firstName} {player.lastName} ({player.team})
                  </Text>
                  <Text
                    fontFamily="$body"
                    fontSize={13}
                    color="$gray11"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {player.fpg.toFixed(1)} FPG ·{' '}
                    {player.ownershipPct.toFixed(0)}%
                  </Text>
                </XStack>
              ))}
            </YStack>
          );
        })}
      </YStack>
    </YStack>
  );
}
