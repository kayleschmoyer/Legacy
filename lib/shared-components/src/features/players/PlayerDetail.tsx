import React from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';

// Generic player detail interface
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
  // Add more stats as needed
}

export interface PlayerDetailProps {
  player?: PlayerDetailData;
  loading?: boolean;
  error?: string;
  onPlayerSelect?: (playerId: number) => void;
}

// Mock player data for fallback
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

function PlayerDetail({ player, loading, error }: PlayerDetailProps) {
  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$gray10" padding="$5">
        <Text color="$white" fontSize="$4" textAlign="center">
          Loading player details...
        </Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack flex={1} backgroundColor="$gray10" padding="$5">
        <Text color="$red8" fontSize="$4" textAlign="center">
          Error: {error}
        </Text>
      </YStack>
    );
  }

  if (!player) {
    return (
      <YStack flex={1} backgroundColor="$gray10" padding="$5">
        <Text color="$red8" fontSize="$4" textAlign="center">
          Player not found
        </Text>
      </YStack>
    );
  }

  return (
    <ScrollView flex={1} backgroundColor="$gray10" padding="$5">
      <YStack
        alignItems="center"
        marginBottom="$7"
        paddingBottom="$5"
        borderBottomWidth={1}
        borderBottomColor="$gray8"
      >
        <Text
          fontSize="$8"
          fontWeight="bold"
          color="$yellow10"
          marginBottom="$1"
        >
          {player.name}
        </Text>
        <Text fontSize="$5" color="$white" marginBottom="$1">
          {player.position}
        </Text>
        <Text fontSize="$4" color="$gray6">
          {player.team}
        </Text>
      </YStack>

      <YStack flex={1}>
        <Text
          fontSize="$6"
          fontWeight="bold"
          color="$yellow10"
          marginBottom="$4"
          marginTop="$2"
        >
          Batting Statistics
        </Text>

        {player.battingAvg !== undefined && (
          <XStack
            justifyContent="space-between"
            paddingVertical="$2"
            borderBottomWidth={1}
            borderBottomColor="$gray8"
          >
            <Text fontSize="$4" color="$white">
              Batting Average:
            </Text>
            <Text fontSize="$4" color="$yellow10" fontWeight="bold">
              {player.battingAvg.toFixed(3)}
            </Text>
          </XStack>
        )}

        {player.homeRuns !== undefined && (
          <XStack
            justifyContent="space-between"
            paddingVertical="$2"
            borderBottomWidth={1}
            borderBottomColor="$gray8"
          >
            <Text fontSize="$4" color="$white">
              Home Runs:
            </Text>
            <Text fontSize="$4" color="$yellow10" fontWeight="bold">
              {player.homeRuns}
            </Text>
          </XStack>
        )}

        {player.rbi !== undefined && (
          <XStack
            justifyContent="space-between"
            paddingVertical="$2"
            borderBottomWidth={1}
            borderBottomColor="$gray8"
          >
            <Text fontSize="$4" color="$white">
              RBIs:
            </Text>
            <Text fontSize="$4" color="$yellow10" fontWeight="bold">
              {player.rbi}
            </Text>
          </XStack>
        )}

        {player.runs !== undefined && (
          <XStack
            justifyContent="space-between"
            paddingVertical="$2"
            borderBottomWidth={1}
            borderBottomColor="$gray8"
          >
            <Text fontSize="$4" color="$white">
              Runs:
            </Text>
            <Text fontSize="$4" color="$yellow10" fontWeight="bold">
              {player.runs}
            </Text>
          </XStack>
        )}

        {player.hits !== undefined && (
          <XStack
            justifyContent="space-between"
            paddingVertical="$2"
            borderBottomWidth={1}
            borderBottomColor="$gray8"
          >
            <Text fontSize="$4" color="$white">
              Hits:
            </Text>
            <Text fontSize="$4" color="$yellow10" fontWeight="bold">
              {player.hits}
            </Text>
          </XStack>
        )}

        {player.obp !== undefined && (
          <XStack
            justifyContent="space-between"
            paddingVertical="$2"
            borderBottomWidth={1}
            borderBottomColor="$gray8"
          >
            <Text fontSize="$4" color="$white">
              On-Base Percentage:
            </Text>
            <Text fontSize="$4" color="$yellow10" fontWeight="bold">
              {player.obp.toFixed(3)}
            </Text>
          </XStack>
        )}

        {player.slg !== undefined && (
          <XStack
            justifyContent="space-between"
            paddingVertical="$2"
            borderBottomWidth={1}
            borderBottomColor="$gray8"
          >
            <Text fontSize="$4" color="$white">
              Slugging Percentage:
            </Text>
            <Text fontSize="$4" color="$yellow10" fontWeight="bold">
              {player.slg.toFixed(3)}
            </Text>
          </XStack>
        )}

        {/* Pitching Stats */}
        {(player.era !== undefined || player.wins !== undefined) && (
          <>
            <Text
              fontSize="$6"
              fontWeight="bold"
              color="$yellow10"
              marginBottom="$4"
              marginTop="$2"
            >
              Pitching Statistics
            </Text>

            {player.era !== undefined && (
              <XStack
                justifyContent="space-between"
                paddingVertical="$2"
                borderBottomWidth={1}
                borderBottomColor="$gray8"
              >
                <Text fontSize="$4" color="$white">
                  ERA:
                </Text>
                <Text fontSize="$4" color="$yellow10" fontWeight="bold">
                  {player.era.toFixed(2)}
                </Text>
              </XStack>
            )}

            {player.wins !== undefined && (
              <XStack
                justifyContent="space-between"
                paddingVertical="$2"
                borderBottomWidth={1}
                borderBottomColor="$gray8"
              >
                <Text fontSize="$4" color="$white">
                  Wins:
                </Text>
                <Text fontSize="$4" color="$yellow10" fontWeight="bold">
                  {player.wins}
                </Text>
              </XStack>
            )}

            {player.losses !== undefined && (
              <XStack
                justifyContent="space-between"
                paddingVertical="$2"
                borderBottomWidth={1}
                borderBottomColor="$gray8"
              >
                <Text fontSize="$4" color="$white">
                  Losses:
                </Text>
                <Text fontSize="$4" color="$yellow10" fontWeight="bold">
                  {player.losses}
                </Text>
              </XStack>
            )}

            {player.saves !== undefined && (
              <XStack
                justifyContent="space-between"
                paddingVertical="$2"
                borderBottomWidth={1}
                borderBottomColor="$gray8"
              >
                <Text fontSize="$4" color="$white">
                  Saves:
                </Text>
                <Text fontSize="$4" color="$yellow10" fontWeight="bold">
                  {player.saves}
                </Text>
              </XStack>
            )}
          </>
        )}
      </YStack>
    </ScrollView>
  );
}

// Component that takes a player ID and fetches data
export interface PlayerDetailByIdProps {
  playerId: number;
}

function PlayerDetailById({ playerId }: PlayerDetailByIdProps) {
  const player = getPlayerDetails(playerId);

  return <PlayerDetail player={player} />;
}

export { PlayerDetail };
export { PlayerDetailById };
