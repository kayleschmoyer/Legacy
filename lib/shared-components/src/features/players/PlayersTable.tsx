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
  View,
  Sheet,
} from 'tamagui';
import {
  ChevronDown,
  Search,
  RefreshCw,
  ChevronUp,
  User,
  Tag,
  ArrowUpDown,
} from '@tamagui/lucide-icons';
import { useGetAllPlayersQuery, PlayerFragment } from './PlayersApi';

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
}: PlayersTableProps): JSX.Element {
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
      <YStack padding="$4" space="$3" alignItems="center">
        <Text color="$red10">Error loading players: {error.message}</Text>
        <Button onPress={handleRefresh} icon={RefreshCw}>
          Try Again
        </Button>
      </YStack>
    );
  }

  return (
    <YStack flex={1} padding={compact ? '$2' : '$4'} space="$3">
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center">
        <H2 size={compact ? '$5' : '$6'}>{title}</H2>
        <Button
          size={compact ? '$2' : '$3'}
          variant="outlined"
          onPress={handleRefresh}
          icon={RefreshCw}
          disabled={loading}
        >
          {compact ? '' : 'Refresh'}
        </Button>
      </XStack>

      {/* Controls */}
      <XStack space="$3" flexWrap="wrap">
        {/* Search */}
        {showSearch && (
          <XStack flex={1} minWidth={200} alignItems="center" space="$2">
            <Search size={16} color="$gray10" />
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

            <Select.Adapt when="sm" platform="touch">
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
                          <Select.ItemIndicator marginLeft="auto">
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
              <Select.ScrollUpButton
                alignItems="center"
                justifyContent="center"
                position="relative"
                width="100%"
                height="$3"
              >
                <ChevronUp size={20} />
              </Select.ScrollUpButton>

              <Select.Viewport minWidth={200}>
                {SORT_OPTIONS.map((option, index) => (
                  <Select.Item
                    key={index}
                    index={index}
                    value={`${option.orderBy}_${option.orderDirection}`}
                  >
                    <Select.ItemText>{option.label}</Select.ItemText>
                    <Select.ItemIndicator marginLeft="auto">
                      <ArrowUpDown size={16} />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>

              <Select.ScrollDownButton
                alignItems="center"
                justifyContent="center"
                position="relative"
                width="100%"
                height="$3"
              >
                <ChevronDown size={20} />
              </Select.ScrollDownButton>
            </Select.Content>
          </Select>
        )}
      </XStack>

      <Separator />

      {/* Loading State */}
      {loading && (
        <XStack justifyContent="center" padding="$4">
          <Spinner size="large" />
        </XStack>
      )}

      {/* Table Content */}
      {!loading && (
        <ScrollView flex={1} showsVerticalScrollIndicator={true}>
          <YStack space="$1">
            {/* Table Header */}
            <XStack
              backgroundColor="$gray2"
              padding={compact ? '$2' : '$3'}
              borderRadius="$2"
              borderWidth={1}
              borderColor="$gray6"
            >
              <Text flex={0.8} fontWeight="bold" size={compact ? '$2' : '$3'}>
                ID
              </Text>
              <Text flex={2} fontWeight="bold" size={compact ? '$2' : '$3'}>
                Name
              </Text>
              <Text flex={1.5} fontWeight="bold" size={compact ? '$2' : '$3'}>
                Bref ID
              </Text>
              {selectable && (
                <Text flex={1} fontWeight="bold" size={compact ? '$2' : '$3'}>
                  Action
                </Text>
              )}
            </XStack>

            {/* Table Rows */}
            {filteredPlayers.length === 0 ? (
              <XStack justifyContent="center" padding="$4">
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
                  padding={compact ? '$2' : '$3'}
                  backgroundColor={index % 2 === 0 ? '$gray1' : 'transparent'}
                  borderRadius="$2"
                  borderWidth={selectedPlayer?.id === player.id ? 2 : 1}
                  borderColor={
                    selectedPlayer?.id === player.id ? '$blue8' : '$gray4'
                  }
                  pressStyle={{
                    backgroundColor: '$gray3',
                  }}
                  onPress={() => handlePlayerClick(player)}
                  cursor={onPlayerSelect ? 'pointer' : 'default'}
                >
                  <Text flex={0.8} size={compact ? '$2' : '$3'} color="$gray11">
                    {player.id}
                  </Text>
                  <XStack flex={2} alignItems="center" space="$2">
                    <User size={compact ? 12 : 16} color="$gray10" />
                    <Text size={compact ? '$2' : '$3'} fontWeight="500">
                      {getFullName(player)}
                    </Text>
                  </XStack>
                  <XStack flex={1.5} alignItems="center" space="$2">
                    <Tag size={compact ? 10 : 14} color="$gray10" />
                    <Text
                      size={compact ? '$2' : '$3'}
                      color="$gray11"
                      fontFamily="$mono"
                    >
                      {player.brefId}
                    </Text>
                  </XStack>
                  {selectable && (
                    <XStack flex={1} justifyContent="center">
                      <Button
                        size={compact ? '$1' : '$2'}
                        variant={
                          selectedPlayer?.id === player.id
                            ? 'solid'
                            : 'outlined'
                        }
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
              justifyContent="space-between"
              alignItems="center"
              padding="$2"
            >
              <Button
                size={compact ? '$2' : '$3'}
                variant="outlined"
                disabled={currentPage === 0}
                onPress={handlePrevPage}
              >
                Previous
              </Button>
              <Text size={compact ? '$2' : '$3'} color="$gray11">
                Page {currentPage + 1}
              </Text>
              <Button
                size={compact ? '$2' : '$3'}
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
        <XStack justifyContent="center" padding="$2">
          <Text size={compact ? '$1' : '$2'} color="$gray10">
            {searchTerm
              ? `${filteredPlayers.length} of ${data?.players?.length || 0} players shown`
              : `${data?.players?.length || 0} players total`}
          </Text>
        </XStack>
      )}
    </YStack>
  );
}
