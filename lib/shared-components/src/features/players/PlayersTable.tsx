import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  H2,
  Input,
  ScrollView,
  Select,
  Separator,
  Sheet,
  Spinner,
  Text,
  View,
  XStack,
  YStack,
} from 'tamagui';
import {
  ArrowUpDown,
  ChevronDown,
  RefreshCw,
  Search,
  Tag,
  User,
} from '@tamagui/lucide-icons';
import { PlayerFragment, useGetAllPlayersQuery } from './PlayersApi';

export interface PlayersTableProps {
  onPlayerSelect?: (player: PlayerFragment) => void;
  pageSize?: number;
  showSearch?: boolean;
  showSorting?: boolean;
  showPagination?: boolean;
  title?: string;
  selectable?: boolean;
  compact?: boolean;
}

interface SortOption {
  label: string;
  orderBy: string;
  orderDirection: string;
}

const SORT_OPTIONS: SortOption[] = [
  { label: 'First Name (A-Z)', orderBy: 'firstName', orderDirection: 'asc' },
  { label: 'First Name (Z-A)', orderBy: 'firstName', orderDirection: 'desc' },
  { label: 'Last Name (A-Z)', orderBy: 'lastName', orderDirection: 'asc' },
  { label: 'Last Name (Z-A)', orderBy: 'lastName', orderDirection: 'desc' },
  { label: 'ID (Low to High)', orderBy: 'id', orderDirection: 'asc' },
  { label: 'ID (High to Low)', orderBy: 'id', orderDirection: 'desc' },
  { label: 'Bref ID (A-Z)', orderBy: 'brefId', orderDirection: 'asc' },
  { label: 'Bref ID (Z-A)', orderBy: 'brefId', orderDirection: 'desc' },
];

export function PlayersTable({
  onPlayerSelect,
  pageSize = 50,
  showSearch = true,
  showSorting = true,
  showPagination = true,
  title = 'Players',
  selectable = false,
  compact = false,
}: PlayersTableProps): React.ReactElement {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentSort, setCurrentSort] = useState<SortOption>(SORT_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerFragment | null>(
    null,
  );

  const { data, loading, error, refetch } = useGetAllPlayersQuery({
    variables: {
      limit: pageSize,
      offset: currentPage * pageSize,
      orderBy: currentSort.orderBy,
      orderDirection: currentSort.orderDirection,
    },
    errorPolicy: 'all',
  });

  // Filter players based on search term
  const filteredPlayers = useMemo(() => {
    if (!data?.players || !searchTerm.trim()) {
      return data?.players || [];
    }

    const lowerSearchTerm = searchTerm.toLowerCase();
    return data.players.filter(
      (player) =>
        player.firstName?.toLowerCase().includes(lowerSearchTerm) ||
        player.lastName?.toLowerCase().includes(lowerSearchTerm) ||
        player.brefId?.toLowerCase().includes(lowerSearchTerm) ||
        `${player.firstName} ${player.lastName}`
          .toLowerCase()
          .includes(lowerSearchTerm),
    );
  }, [data?.players, searchTerm]);

  const handlePlayerClick = useCallback(
    (player: PlayerFragment) => {
      if (selectable) {
        setSelectedPlayer(player);
      }
      onPlayerSelect?.(player);
    },
    [onPlayerSelect, selectable],
  );

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleSortChange = useCallback((value: string) => {
    const sortOption = SORT_OPTIONS.find(
      (option) => `${option.orderBy}_${option.orderDirection}` === value,
    );
    if (sortOption) {
      setCurrentSort(sortOption);
      setCurrentPage(0); // Reset to first page when sorting changes
    }
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => prev + 1);
  }, []);

  const handlePrevPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(0, prev - 1));
  }, []);

  const getFullName = useCallback((player: PlayerFragment) => {
    return `${player.firstName || ''} ${player.lastName || ''}`.trim();
  }, []);

  if (error) {
    return (
      <YStack p="$4" gap="$3" ai="center">
        <Text color="$red10">Error loading players: {error.message}</Text>
        <Button onPress={handleRefresh} icon={RefreshCw}>
          Try Again
        </Button>
      </YStack>
    );
  }

  return (
    <YStack flex={1} p={compact ? '$2' : '$4'} gap="$3">
      {/* Header */}
      <XStack jc="space-between" ai="center">
        <H2 size={compact ? 5 : 6}>{title}</H2>
        <Button
          size={compact ? 2 : 3}
          variant="outlined"
          onPress={handleRefresh}
          icon={RefreshCw}
          disabled={loading}
        >
          {compact ? '' : 'Refresh'}
        </Button>
      </XStack>

      {/* Controls */}
      <XStack gap="$3" flexWrap="wrap">
        {/* Search */}
        {showSearch && (
          <XStack flex={1} minW={200} ai="center" gap="$2">
            <Search size={16} color="gray" />
            <Input
              flex={1}
              placeholder="Search players..."
              value={searchTerm}
              onChangeText={setSearchTerm}
              size={compact ? '$2' : '$3'}
            />
          </XStack>
        )}

        {/* Sort Options */}
        {showSorting && (
          <Select
            value={`${currentSort.orderBy}_${currentSort.orderDirection}`}
            onValueChange={handleSortChange}
            size={compact ? '$2' : '$3'}
          >
            <Select.Trigger width={200} iconAfter={ChevronDown}>
              <Select.Value placeholder="Sort by..." />
            </Select.Trigger>

            <Select.Adapt platform="touch">
              <Sheet modal dismissOnSnapToBottom>
                <Sheet.Frame>
                  <Sheet.ScrollView>
                    <Select.Viewport>
                      {SORT_OPTIONS.map((option, index) => (
                        <Select.Item
                          key={index}
                          index={index}
                          value={`${option.orderBy}_${option.orderDirection}`}
                        >
                          <Select.ItemText>{option.label}</Select.ItemText>
                          <Select.ItemIndicator marginLeft={0}>
                            <ArrowUpDown size={16} />
                          </Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Sheet.ScrollView>
                </Sheet.Frame>
              </Sheet>
            </Select.Adapt>

            <Select.Content zIndex={200000}>
              <Select.ScrollUpButton />

              <Select.Viewport minW={200}>
                {SORT_OPTIONS.map((option, index) => (
                  <Select.Item
                    key={index}
                    index={index}
                    value={`${option.orderBy}_${option.orderDirection}`}
                  >
                    <Select.ItemText>{option.label}</Select.ItemText>
                    <Select.ItemIndicator marginLeft={0}>
                      <ArrowUpDown size={16} />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>

              <Select.ScrollDownButton />
            </Select.Content>
          </Select>
        )}
      </XStack>

      <Separator />

      {/* Loading State */}
      {loading && (
        <XStack jc="center" p="$4">
          <Spinner size="large" />
        </XStack>
      )}

      {/* Table Content */}
      {!loading && (
        <ScrollView flex={1} showsVerticalScrollIndicator={true}>
          <YStack gap="$1">
            {/* Table Header */}
            <XStack
              bg="$gray2"
              p={compact ? '$2' : '$3'}
              r="$2"
              borderWidth={1}
              borderColor="gray"
            >
              <Text
                flex={0.8}
                fontWeight="bold"
                fontSize={compact ? 2 : 3}
              >
                ID
              </Text>
              <Text flex={2} fontWeight="bold" fontSize={compact ? 2 : 3}>
                Name
              </Text>
              <Text
                flex={1.5}
                fontWeight="bold"
                fontSize={compact ? 2 : 3}
              >
                Bref ID
              </Text>
              {selectable && (
                <Text
                  flex={1}
                  fontWeight="bold"
                  fontSize={compact ? 2 : 3}
                >
                  Action
                </Text>
              )}
            </XStack>

            {/* Table Rows */}
            {filteredPlayers.length === 0 ? (
              <XStack jc="center" p="$4">
                <Text color="$gray10">
                  {searchTerm
                    ? 'No players found matching your search.'
                    : 'No players available.'}
                </Text>
              </XStack>
            ) : (
              filteredPlayers.map((player, index) => (
                <XStack
                  key={player.id}
                  p={compact ? '$2' : '$3'}
                  bg={index % 2 === 0 ? '$gray1' : 'transparent'}
                  r="$2"
                  borderWidth={selectedPlayer?.id === player.id ? 2 : 1}
                  borderColor={
                    selectedPlayer?.id === player.id ? '$blue8' : 'gray'
                  }
                  pressStyle={{
                    bg: '$gray3',
                  }}
                  onPress={() => handlePlayerClick(player)}
                  cursor={onPlayerSelect ? 'pointer' : 'default'}
                >
                  <Text
                    flex={0.8}
                    fontSize={compact ? 2 : 3}
                    color="gray"
                  >
                    {player.id}
                  </Text>
                  <XStack flex={2} ai="center" gap="$2">
                    <User size={compact ? 12 : 16} color="gray" />
                    <Text fontSize={compact ? 2 : 3} fontWeight="500">
                      {getFullName(player)}
                    </Text>
                  </XStack>
                  <XStack flex={1.5} ai="center" gap="$2">
                    <Tag size={compact ? 10 : 14} color="gray" />
                    <Text
                      fontSize={compact ? 2 : 3}
                      color="gray"
                      fontFamily="$mono"
                    >
                      {player.brefId}
                    </Text>
                  </XStack>
                  {selectable && (
                    <XStack flex={1} jc="center">
                      <Button
                        size={compact ? '$1' : '$2'}
                        variant="outlined"
                        onPress={() => handlePlayerClick(player)}
                      >
                        {selectedPlayer?.id === player.id
                          ? 'Selected'
                          : 'Select'}
                      </Button>
                    </XStack>
                  )}
                </XStack>
              ))
            )}
          </YStack>
        </ScrollView>
      )}

      {/* Pagination */}
      {showPagination &&
        !loading &&
        data?.players &&
        data.players.length >= pageSize && (
          <>
            <Separator />
            <XStack
              jc="space-between"
              ai="center"
              p="$2"
            >
              <Button
                size={compact ? '$2' : '$3'}
                variant="outlined"
                disabled={currentPage === 0}
                onPress={handlePrevPage}
              >
                Previous
              </Button>
              <Text fontSize={compact ? 2 : 3} color="gray">
                Page {currentPage + 1}
              </Text>
              <Button
                size={compact ? 2 : 3}
                variant="outlined"
                disabled={data.players.length < pageSize}
                onPress={handleNextPage}
              >
                Next
              </Button>
            </XStack>
          </>
        )}

      {/* Results Summary */}
      {!loading && (
        <XStack jc="center" p="$2">
          <Text fontSize={compact ? 1 : 2} color="gray">
            {searchTerm
              ? `${filteredPlayers.length} of ${data?.players?.length || 0} players shown`
              : `${data?.players?.length || 0} players total`}
          </Text>
        </XStack>
      )}
    </YStack>
  );
}
