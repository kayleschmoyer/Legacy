import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  H2,
  Input,
  ScrollView,
  Select,
  Separator,
  Spinner,
  Text,
  View,
  XStack,
  YStack,
} from 'tamagui';
import { ChevronDown, RefreshCw, Search } from '@tamagui/lucide-icons';
import { PlayerCard } from './PlayerCard';
import { PlayerFragment, useGetAllPlayersQuery } from './PlayersApi';

export interface PlayersGridProps {
  onPlayerSelect?: (player: PlayerFragment) => void;
  pageSize?: number;
  showSearch?: boolean;
  showSorting?: boolean;
  title?: string;
  /** Map of player ID to projected fantasy points per game (optional) */
  projectedPoints?: Map<number, number>;
  /** Whether to show projections on player cards */
  showProjections?: boolean;
}

const SORT_OPTIONS = [
  { label: 'Name (A-Z)', value: 'NAME_ASC' },
  { label: 'Name (Z-A)', value: 'NAME_DESC' },
  { label: 'ID (Low to High)', value: 'ID_ASC' },
  { label: 'ID (High to Low)', value: 'ID_DESC' },
] as const;

function PlayersGrid({
  onPlayerSelect,
  pageSize = 50,
  showSearch = true,
  showSorting = true,
  title = 'Players',
  projectedPoints,
  showProjections = false,
}: PlayersGridProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<string>('NAME_ASC');

  const { data, loading, error, refetch } = useGetAllPlayersQuery({
    variables: {
      limit: pageSize,
      orderBy: sortBy.split('_')[0].toLowerCase(),
      orderDirection: sortBy.split('_')[1].toLowerCase(),
    },
    errorPolicy: 'all',
  });

  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const filteredPlayers = useMemo(() => {
    if (!data?.players) return [];

    const players = data.players.filter(
      (player): player is PlayerFragment => player !== null,
    );

    if (!searchTerm) return players;

    return players.filter(
      (player) =>
        `${player.firstName || ''} ${player.lastName || ''}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        player.brefId?.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [data?.players, searchTerm]);

  if (loading && !data) {
    return (
      <YStack
        flex={1}
        style={{ justifyContent: 'center', alignItems: 'center', padding: 16 }}
      >
        <Spinner size="large" color="$blue10" />
        <Text style={{ marginTop: 8 }}>Loading players...</Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack
        flex={1}
        style={{ justifyContent: 'center', alignItems: 'center', padding: 16 }}
      >
        <Text color="$red10" style={{ textAlign: 'center', marginBottom: 12 }}>
          Error loading players: {error.message}
        </Text>
        <Button onPress={handleRefresh}>
          <RefreshCw size={16} />
          Retry
        </Button>
      </YStack>
    );
  }

  return (
    <YStack flex={1} p="$4" bg="$background">
      {/* Header */}
      <YStack mb="$4">
        <XStack jc="space-between" ai="center" mb="$3">
          <H2 color="$color">{title}</H2>
          <XStack gap="$2" ai="center">
            <Text color="$gray10">
              {filteredPlayers.length} player
              {filteredPlayers.length !== 1 ? 's' : ''}
            </Text>
            <Button size="$3" onPress={handleRefresh} variant="outlined">
              <RefreshCw size={16} />
            </Button>
          </XStack>
        </XStack>

        {/* Controls */}
        {(showSearch || showSorting) && (
          <XStack gap="$3" ai="center" flexWrap="wrap">
            {showSearch && (
              <XStack flex={1} minW={200} ai="center">
                <Input
                  placeholder="Search players..."
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  flex={1}
                  size="$3"
                />
                {/* Search overlay button */}
                <View pos="absolute" r="$2" t="$2" zi={1} pointerEvents="none">
                  <Button size={2} circular chromeless pointerEvents="auto">
                    <Search size={16} />
                  </Button>
                </View>
              </XStack>
            )}

            {showSorting && (
              <Select value={sortBy} onValueChange={setSortBy} size="$3">
                <Select.Trigger width={180}>
                  <Select.Value placeholder="Sort by..." />
                  <Select.Icon>
                    <ChevronDown />
                  </Select.Icon>
                </Select.Trigger>

                <Select.Content zIndex={200000}>
                  <Select.ScrollUpButton />
                  <Select.Viewport>
                    <Select.Group>
                      <Select.Label>Sort Options</Select.Label>
                      {SORT_OPTIONS.map((option, idx) => (
                        <Select.Item
                          key={option.value}
                          index={idx}
                          value={option.value}
                        >
                          <Select.ItemText>{option.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Group>
                  </Select.Viewport>
                  <Select.ScrollDownButton />
                </Select.Content>
              </Select>
            )}
          </XStack>
        )}
      </YStack>

      <Separator mb="$4" />

      {/* Players Grid */}
      {filteredPlayers.length === 0 ? (
        <YStack flex={1} jc="center" ai="center">
          <Text color="$gray10" ta="center">
            {searchTerm
              ? 'No players found matching your search.'
              : 'No players available.'}
          </Text>
        </YStack>
      ) : (
        <ScrollView>
          <YStack flexDirection="row" flexWrap="wrap" gap="$3" jc="flex-start">
            {filteredPlayers.map((player) => {
              const projection = player.id
                ? projectedPoints?.get(player.id)
                : undefined;

              return (
                <YStack key={player.id} width={200} minW={280} maxW={400}>
                  <PlayerCard
                    player={player}
                    onPlayerClick={onPlayerSelect}
                    projectedPoints={projection}
                    showProjection={showProjections}
                  />
                </YStack>
              );
            })}
          </YStack>
        </ScrollView>
      )}
    </YStack>
  );
}

export { PlayersGrid };
