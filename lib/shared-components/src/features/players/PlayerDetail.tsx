import React from 'react';
import { ScrollView, Spinner, Text, XStack, YStack } from 'tamagui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Generic player detail interface used by the cross-platform component. */
export interface PlayerDetailData {
  id: number;
  name: string;
  position: string;
  team: string;
  battingAvg?: number;
  homeRuns?: number;
  rbi?: number;
  runs?: number;
  hits?: number;
  strikeouts?: number;
  walks?: number;
  obp?: number;
  slg?: number;
  era?: number;
  wins?: number;
  losses?: number;
  saves?: number;
}

export interface PlayerDetailProps {
  player?: PlayerDetailData;
  loading?: boolean;
  error?: string;
  onPlayerSelect?: (playerId: number) => void;
}

// ---------------------------------------------------------------------------
// Mock data (fallback for stories / testing)
// ---------------------------------------------------------------------------

const getPlayerDetails = (playerId: number): PlayerDetailData | undefined => {
  const playersData: PlayerDetailData[] = [
    {
      battingAvg: 0.342,
      homeRuns: 714,
      id: 1,
      name: 'Babe Ruth',
      position: 'OF',
      rbi: 2213,
      runs: 2174,
      team: 'New York Yankees',
    },
    {
      battingAvg: 0.366,
      homeRuns: 117,
      id: 2,
      name: 'Ty Cobb',
      position: 'CF',
      rbi: 1944,
      runs: 2246,
      team: 'Detroit Tigers',
    },
  ];
  return playersData.find((player) => player.id === playerId);
};

// ---------------------------------------------------------------------------
// Stat row helper
// ---------------------------------------------------------------------------

function StatRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <XStack
      justifyContent="space-between"
      paddingVertical="$2"
      paddingHorizontal="$3"
      borderBottomWidth={1}
      borderBottomColor="$borderColor"
    >
      <Text fontSize="$3" color="$textMuted">
        {label}
      </Text>
      <Text
        fontSize="$3"
        fontWeight="700"
        color={accent ? '$color12' : '$color'}
      >
        {value}
      </Text>
    </XStack>
  );
}

// ---------------------------------------------------------------------------
// Section header helper
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <XStack
      paddingHorizontal="$3"
      paddingVertical="$2"
      backgroundColor="$backgroundFocus"
      borderBottomWidth={1}
      borderBottomColor="$borderColor"
    >
      <Text fontSize="$4" fontWeight="700" color="$color12">
        {title}
      </Text>
    </XStack>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function PlayerDetail({ player, loading, error }: PlayerDetailProps) {
  if (loading) {
    return (
      <YStack
        flex={1}
        backgroundColor="$background"
        padding="$5"
        alignItems="center"
        justifyContent="center"
      >
        <Spinner size="large" color="$color10" />
        <Text
          color="$textMuted"
          fontSize="$4"
          marginTop="$3"
          textAlign="center"
        >
          Loading player details…
        </Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack
        flex={1}
        backgroundColor="$background"
        padding="$5"
        alignItems="center"
        justifyContent="center"
      >
        <Text color="$red10" fontSize="$4" textAlign="center">
          Error: {error}
        </Text>
      </YStack>
    );
  }

  if (!player) {
    return (
      <YStack
        flex={1}
        backgroundColor="$background"
        padding="$5"
        alignItems="center"
        justifyContent="center"
      >
        <Text color="$red10" fontSize="$4" textAlign="center">
          Player not found
        </Text>
      </YStack>
    );
  }

  return (
    <ScrollView flex={1} backgroundColor="$background" padding="$4">
      {/* ── Player header ── */}
      <YStack
        alignItems="center"
        marginBottom="$5"
        paddingBottom="$4"
        borderBottomWidth={1}
        borderBottomColor="$borderColor"
        gap="$1"
      >
        <Text fontSize="$8" fontWeight="bold" color="$color12">
          {player.name}
        </Text>
        <XStack gap="$2" alignItems="center">
          <Text
            fontSize="$2"
            fontWeight="700"
            color="$color"
            backgroundColor="$backgroundFocus"
            paddingHorizontal="$2"
            paddingVertical="$1"
            borderRadius="$2"
          >
            {player.position}
          </Text>
          <Text fontSize="$4" color="$textMuted">
            {player.team}
          </Text>
        </XStack>
      </YStack>

      {/* ── Batting stats ── */}
      <YStack
        borderRadius="$4"
        borderWidth={1}
        borderColor="$borderColor"
        overflow="hidden"
        marginBottom="$4"
      >
        <SectionHeader title="Batting Statistics" />

        {player.battingAvg !== undefined && (
          <StatRow
            label="Batting Average"
            value={player.battingAvg.toFixed(3)}
            accent
          />
        )}
        {player.homeRuns !== undefined && (
          <StatRow label="Home Runs" value={player.homeRuns} />
        )}
        {player.rbi !== undefined && (
          <StatRow label="RBIs" value={player.rbi} />
        )}
        {player.runs !== undefined && (
          <StatRow label="Runs" value={player.runs} />
        )}
        {player.hits !== undefined && (
          <StatRow label="Hits" value={player.hits} />
        )}
        {player.obp !== undefined && (
          <StatRow
            label="On-Base Percentage"
            value={player.obp.toFixed(3)}
            accent
          />
        )}
        {player.slg !== undefined && (
          <StatRow
            label="Slugging Percentage"
            value={player.slg.toFixed(3)}
            accent
          />
        )}
      </YStack>

      {/* ── Pitching stats (shown only if relevant) ── */}
      {(player.era !== undefined || player.wins !== undefined) && (
        <YStack
          borderRadius="$4"
          borderWidth={1}
          borderColor="$borderColor"
          overflow="hidden"
          marginBottom="$4"
        >
          <SectionHeader title="Pitching Statistics" />

          {player.era !== undefined && (
            <StatRow label="ERA" value={player.era.toFixed(2)} accent />
          )}
          {player.wins !== undefined && (
            <StatRow label="Wins" value={player.wins} />
          )}
          {player.losses !== undefined && (
            <StatRow label="Losses" value={player.losses} />
          )}
          {player.saves !== undefined && (
            <StatRow label="Saves" value={player.saves} />
          )}
        </YStack>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Convenience wrapper that takes only a player ID
// ---------------------------------------------------------------------------

export interface PlayerDetailByIdProps {
  playerId: number;
}

function PlayerDetailById({ playerId }: PlayerDetailByIdProps) {
  const player = getPlayerDetails(playerId);

  return <PlayerDetail player={player} />;
}

export { PlayerDetail };
export { PlayerDetailById };
