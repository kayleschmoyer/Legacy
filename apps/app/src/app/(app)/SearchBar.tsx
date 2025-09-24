import React, { useCallback, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import {
  Button,
  H4,
  Input,
  ScrollView,
  Sheet,
  Text,
  XStack,
  YStack,
} from 'tamagui';

type FilterOption = {
  label: string;
  value: string | null;
  options: { label: string; value: string | null }[];
};

type SearchBarProps = {
  value: string;
  onSearch: (text: string) => void;
  onFilter: (filters: { [key: string]: string | null }) => void;
  currentFilters: { [key: string]: string | null };
};

const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onSearch,
  onFilter,
  currentFilters,
}) => {
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<{ [key: string]: string | null }>(
    currentFilters,
  );

  const filterOptions: FilterOption[] = [
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
      value: currentFilters.position || null,
    },
    {
      label: 'Team',
      options: [
        { label: 'All Teams', value: null },
        { label: 'NY Yankees', value: 'NY Yankees' },
        { label: 'LA Dodgers', value: 'LA Dodgers' },
        // Add more teams here
      ],
      value: currentFilters.team || null,
    },
    {
      label: 'Fantasy Points',
      options: [
        { label: 'Any', value: null },
        { label: '> 300', value: '>300' },
        { label: '> 200', value: '>200' },
        { label: '< 200', value: '<200' },
      ],
      value: currentFilters.fantasyPoints || null,
    },
  ];

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

  return (
    <YStack>
      <XStack
        alignItems="center"
        backgroundColor="$gray8"
        borderRadius="$6"
        paddingHorizontal="$3"
        marginBottom="$3"
      >
        <Input
          flex={1}
          placeholder="Search players..."
          value={value}
          onChangeText={handleSearch}
          backgroundColor="transparent"
          borderWidth={0}
          color="$color"
          placeholderTextColor="$gray10"
        />
        <Button
          size="$3"
          backgroundColor="transparent"
          onPress={() => setShowFilterModal(true)}
          padding="$2"
        >
          <MaterialIcons name="filter-list" size={24} color="white" />
        </Button>
      </XStack>

      <Sheet
        modal
        open={showFilterModal}
        onOpenChange={setShowFilterModal}
        snapPoints={[80]}
      >
        <Sheet.Overlay />
        <Sheet.Frame>
          <Sheet.Handle />
          <YStack padding="$4" space="$4">
            <H4 color="$color">Filter Players</H4>
            <ScrollView>
              <YStack space="$3">
                {filterOptions.map((item) => (
                  <YStack key={item.label} space="$2" marginBottom="$3">
                    <XStack alignItems="center" space="$2">
                      <Text color="$color" fontSize="$4">
                        {item.label}:
                      </Text>
                      <Button
                        size="$2"
                        backgroundColor="$gray8"
                        onPress={() =>
                          handleFilterChange(item.label.toLowerCase(), null)
                        }
                      >
                        <Text color="$white" fontSize="$3">
                          Clear
                        </Text>
                      </Button>
                    </XStack>
                    <ScrollView horizontal>
                      <XStack space="$2">
                        {item.options.map((option) => (
                          <Button
                            key={option.value || 'null'}
                            size="$3"
                            backgroundColor={
                              item.value === option.value ? '$blue8' : '$gray7'
                            }
                            onPress={() =>
                              handleFilterChange(
                                item.label.toLowerCase(),
                                option.value,
                              )
                            }
                          >
                            <Text color="$white" fontSize="$3">
                              {option.label}
                            </Text>
                          </Button>
                        ))}
                      </XStack>
                    </ScrollView>
                  </YStack>
                ))}
              </YStack>
            </ScrollView>
            <XStack justifyContent="space-between" space="$3">
              <Button
                flex={1}
                backgroundColor="$gray8"
                onPress={() => setShowFilterModal(false)}
              >
                <Text color="$white" fontWeight="bold">
                  Cancel
                </Text>
              </Button>
              <Button flex={1} backgroundColor="$blue9" onPress={applyFilters}>
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
};

export default SearchBar;
