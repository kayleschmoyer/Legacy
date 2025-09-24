import React, { useCallback, useState } from 'react';
import { FlatList } from 'react-native';
import { Button, Input, Sheet, Text, XStack, YStack } from 'tamagui';

// Generic filter option interface
export interface FilterOption {
  label: string;
  value: string | null;
  options: { label: string; value: string | null }[];
}

export interface SearchBarProps {
  value: string;
  onSearch: (text: string) => void;
  onFilter: (filters: { [key: string]: string | null }) => void;
  currentFilters: { [key: string]: string | null };
  filterOptions?: FilterOption[];
  placeholder?: string;
}

// Default filter options for baseball players
const DEFAULT_FILTER_OPTIONS: FilterOption[] = [
  {
    label: 'Position',
    options: [
      { label: 'All Positions', value: null },
      { label: 'C', value: 'C' },
      { label: '1B', value: '1B' },
      { label: '2B', value: '2B' },
      { label: '3B', value: '3B' },
      { label: 'SS', value: 'SS' },
      { label: 'OF', value: 'OF' },
      { label: 'P', value: 'P' },
    ],
    value: null,
  },
  {
    label: 'Team',
    options: [
      { label: 'All Teams', value: null },
      { label: 'NY Yankees', value: 'NY Yankees' },
      { label: 'LA Dodgers', value: 'LA Dodgers' },
      { label: 'Boston Red Sox', value: 'Boston Red Sox' },
      { label: 'SF Giants', value: 'SF Giants' },
      { label: 'Chicago Cubs', value: 'Chicago Cubs' },
    ],
    value: null,
  },
  {
    label: 'Fantasy Points',
    options: [
      { label: 'Any', value: null },
      { label: '> 300', value: '>300' },
      { label: '> 200', value: '>200' },
      { label: '< 200', value: '<200' },
    ],
    value: null,
  },
];

function SearchBar({
  value,
  onSearch,
  onFilter,
  currentFilters,
  filterOptions = DEFAULT_FILTER_OPTIONS,
  placeholder = 'Search players...',
}: SearchBarProps) {
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<{ [key: string]: string | null }>(
    currentFilters,
  );

  const handleSearch = useCallback(
    (text: string) => {
      onSearch(text);
    },
    [onSearch],
  );

  const handleFilterChange = useCallback(
    (key: string, value: string | null) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const applyFilters = useCallback(() => {
    onFilter(filters);
    setShowFilterModal(false);
  }, [filters, onFilter]);

  const resetFilters = useCallback(() => {
    const resetFilters: { [key: string]: string | null } = {};
    filterOptions.forEach((option) => {
      resetFilters[option.label.toLowerCase()] = null;
    });
    setFilters(resetFilters);
  }, [filterOptions]);

  const renderFilterOption = ({ item }: { item: FilterOption }) => (
    <YStack marginBottom="$5">
      <Text color="$white" fontSize="$4" fontWeight="bold" marginBottom="$3">
        {item.label}:
      </Text>
      <Button
        backgroundColor="$gray7"
        borderRadius="$2"
        paddingHorizontal="$2"
        paddingVertical="$1"
        alignSelf="flex-start"
        marginBottom="$3"
        onPress={() => handleFilterChange(item.label.toLowerCase(), null)}
      >
        <Text color="$white" fontSize="$2">
          Clear
        </Text>
      </Button>
      <FlatList<{ label: string; value: string | null }>
        data={item.options}
        horizontal
        renderItem={({ item: option }) => (
          <Button
            backgroundColor={
              filters[item.label.toLowerCase()] === option.value
                ? '$yellow10'
                : '$gray8'
            }
            borderRadius="$2"
            marginRight="$2"
            paddingHorizontal="$3"
            paddingVertical="$2"
            onPress={() =>
              handleFilterChange(item.label.toLowerCase(), option.value)
            }
          >
            <Text
              color={
                filters[item.label.toLowerCase()] === option.value
                  ? '$black'
                  : '$white'
              }
              fontSize="$3"
            >
              {option.label}
            </Text>
          </Button>
        )}
        keyExtractor={(item) => item.value || 'null'}
        showsHorizontalScrollIndicator={false}
      />
    </YStack>
  );

  // Update filter options with current values
  const updatedFilterOptions = filterOptions.map((option) => ({
    ...option,
    value: filters[option.label.toLowerCase()] || null,
  }));

  return (
    <YStack>
      <XStack
        alignItems="center"
        backgroundColor="$gray8"
        borderRadius="$6"
        marginBottom="$2"
        paddingHorizontal="$4"
      >
        <Input
          flex={1}
          backgroundColor="transparent"
          borderWidth={0}
          color="$white"
          height={40}
          paddingHorizontal="$2"
          placeholder={placeholder}
          placeholderTextColor="$gray6"
          value={value}
          onChangeText={handleSearch}
        />
        <Button
          backgroundColor="transparent"
          borderWidth={0}
          padding="$2"
          onPress={() => setShowFilterModal(true)}
        >
          <Text color="$white" fontSize="$6">
            ⚙
          </Text>
        </Button>
      </XStack>

      <Sheet
        modal
        open={showFilterModal}
        onOpenChange={setShowFilterModal}
        snapPoints={[80]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay />
        <Sheet.Handle />
        <Sheet.Frame backgroundColor="$gray9" padding="$5">
          <YStack gap="$4">
            <Text
              color="$white"
              fontSize="$5"
              fontWeight="bold"
              textAlign="center"
            >
              Filter Players
            </Text>

            <FlatList<FilterOption>
              data={updatedFilterOptions}
              renderItem={renderFilterOption}
              keyExtractor={(item) => item.label}
              showsVerticalScrollIndicator={false}
            />

            <XStack gap="$2" justifyContent="space-between">
              <Button flex={1} backgroundColor="$red8" onPress={resetFilters}>
                <Text color="$white" fontWeight="bold">
                  Reset All
                </Text>
              </Button>
              <Button
                flex={1}
                backgroundColor="$gray6"
                onPress={() => setShowFilterModal(false)}
              >
                <Text color="$white" fontWeight="bold">
                  Cancel
                </Text>
              </Button>
              <Button flex={1} backgroundColor="$blue8" onPress={applyFilters}>
                <Text color="$white" fontWeight="bold">
                  Apply
                </Text>
              </Button>
            </XStack>
          </YStack>
        </Sheet.Frame>
      </Sheet>
    </YStack>
  );
}

export { SearchBar };
