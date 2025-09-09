import React, { useState, useCallback, useMemo } from 'react';
import {
  Button,
  H2,
  Input,
  Spinner,
  Text,
  XStack,
  YStack,
  ScrollView,
  Select,
  Separator,
} from 'tamagui';
import { ChevronDown, Search, RefreshCw } from '@tamagui/lucide-icons';
import { PlayerCard } from './PlayerCard';
import { useGetAllPlayersQuery, PlayerFragment } from './PlayersApi';

export interface PlayersGridProps {
  onPlayerSelect?: (player: PlayerFragment) => void;
  pageSize?: number;
  showSearch?: boolean;
  showSorting?: boolean;
  title?: string;
}

const SORT_OPTIONS = [
  { label: 'Name (A-Z)', value: 'NAME_ASC' },
  { label: 'Name (Z-A)', value: 'NAME_DESC' },
  { label: 'ID (Low to High)', value: 'ID_ASC' },
  { label: 'ID (High to Low)', value: 'ID_DESC' },
] as const;

export function PlayersGrid({
  onPlayerSelect,
  pageSize = 50,
  showSearch = true,
  showSorting = true,
  title = 'Players',
}: PlayersGridProps): JSX.Element {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<string>('NAME_ASC');

  const { data, loading, error, refetch } = useGetAllPlayersQuery({
    variables: {
      first: pageSize,
      orderBy: [sortBy],
    },
    errorPolicy: 'all',
  });

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredPlayers = useMemo(() => {
    if (!data?.players?.nodes) return [];

    const players = data.players.nodes.filter(
      (player): player is PlayerFragment => player !== null
    );

    if (!searchTerm) return players;

    return players.filter(
      (player) =>
        player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        player.brefId.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data?.players?.nodes, searchTerm]);

  if (loading && !data) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Spinner size="large" color="$blue10" />
        <Text marginTop="$2">Loading players...</Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Text color="$red10" textAlign="center" marginBottom="$3">
          Error loading players: {error.message}
        </Text>
        <Button onPress={handleRefresh} theme="active">
          <RefreshCw size={16} />
          Retry
        </Button>
      </YStack>
    );
  }

  return (
    <YStack flex={1} padding="$4" backgroundColor="$background">
      {/* Header */}
      <YStack marginBottom="$4">
        <XStack
          justifyContent="space-between"
          alignItems="center"
          marginBottom="$3"
        >
          <H2 color="$color">{title}</H2>
          <XStack gap="$2" alignItems="center">
            <Text theme="alt2">
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
          <XStack gap="$3" alignItems="center" flexWrap="wrap">
            {showSearch && (
              <XStack flex={1} minWidth={200} alignItems="center">
                <Input
                  placeholder="Search players..."
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  flex={1}
                  size="$3"
                />
                <Button
                  position="absolute"
                  right="$2"
                  zIndex={1}
                  size="$2"
                  circular
                  chromeless
                >
                  <Search size={16} />
                </Button>
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
                      {SORT_OPTIONS.map((option) => (
                        <Select.Item
                          key={option.value}
                          index={option.value}
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

      <Separator marginBottom="$4" />

      {/* Players Grid */}
      {filteredPlayers.length === 0 ? (
        <YStack flex={1} justifyContent="center" alignItems="center">
          <Text theme="alt2" textAlign="center">
            {searchTerm
              ? 'No players found matching your search.'
              : 'No players available.'}
          </Text>
        </YStack>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <YStack
            flexDirection="row"
            flexWrap="wrap"
            gap="$3"
            justifyContent="flex-start"
          >
            {filteredPlayers.map((player) => (
              <YStack
                key={player.id}
                width="calc(50% - 6px)"
                minWidth={280}
                maxWidth={400}
              >
                <PlayerCard player={player} onPlayerClick={onPlayerSelect} />
              </YStack>
            ))}
          </YStack>
        </ScrollView>
      )}
    </YStack>
  );
}
