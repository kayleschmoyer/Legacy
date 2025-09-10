import React, { useCallback, useState } from 'react';
import {
  Icon,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  StyleSheet,
} from '../../platform-components';

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

// Cross-platform icon component
const FilterIcon = () => {
  // For React Native, use Icon with fallback
  return <Icon name="filter-list" size={24} color="white" />;
};

export function SearchBar({
  value,
  onSearch,
  onFilter,
  currentFilters,
  filterOptions = DEFAULT_FILTER_OPTIONS,
  placeholder = 'Search players...',
}: SearchBarProps): React.JSX.Element {
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<{ [key: string]: string | null }>(
    currentFilters
  );

  const handleSearch = useCallback(
    (text: string) => {
      onSearch(text);
    },
    [onSearch]
  );

  const handleFilterChange = useCallback(
    (key: string, value: string | null) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    []
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
    <View style={styles.filterOptionContainer}>
      <Text style={styles.filterOptionLabel}>{item.label}:</Text>
      <TouchableOpacity
        style={styles.filterOptionButton}
        onPress={() => handleFilterChange(item.label.toLowerCase(), null)}
      >
        <Text style={styles.filterOptionButtonText}>Clear</Text>
      </TouchableOpacity>
      <FlatList
        data={item.options}
        horizontal
        renderItem={({
          item: option,
        }: {
          item: { label: string; value: string | null };
        }) => (
          <TouchableOpacity
            style={[
              styles.filterOption,
              filters[item.label.toLowerCase()] === option.value
                ? styles.filterOptionSelected
                : null,
            ]}
            onPress={() =>
              handleFilterChange(item.label.toLowerCase(), option.value)
            }
          >
            <Text style={styles.filterOptionText}>{option.label}</Text>
          </TouchableOpacity>
        )}
        keyExtractor={(item: { label: string; value: string | null }) =>
          item.value || 'null'
        }
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );

  // Update filter options with current values
  const updatedFilterOptions = filterOptions.map((option) => ({
    ...option,
    value: filters[option.label.toLowerCase()] || null,
  }));

  return (
    <View>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={placeholder}
          placeholderTextColor="#999"
          value={value}
          onChangeText={handleSearch}
        />
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilterModal(true)}
        >
          <FilterIcon />
        </TouchableOpacity>
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={showFilterModal}
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Filter Players</Text>

            <FlatList
              data={updatedFilterOptions}
              renderItem={renderFilterOption}
              keyExtractor={(item: FilterOption) => item.label}
              showsVerticalScrollIndicator={false}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.resetButton]}
                onPress={resetFilters}
              >
                <Text style={styles.modalButtonText}>Reset All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowFilterModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.applyButton]}
                onPress={applyFilters}
              >
                <Text style={styles.modalButtonText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    alignItems: 'center',
    backgroundColor: '#333',
    borderRadius: 25,
    flexDirection: 'row',
    marginBottom: 10,
    paddingHorizontal: 15,
  },
  searchInput: {
    color: '#fff',
    flex: 1,
    height: 40,
    paddingHorizontal: 10,
  },
  filterButton: {
    padding: 10,
  },
  filterIconText: {
    color: 'white',
    fontSize: 20,
  },
  modalContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#222',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  filterOptionContainer: {
    marginBottom: 20,
  },
  filterOptionLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  filterOptionButton: {
    backgroundColor: '#444',
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  filterOptionButtonText: {
    color: '#fff',
    fontSize: 12,
  },
  filterOption: {
    backgroundColor: '#333',
    borderRadius: 5,
    marginRight: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterOptionSelected: {
    backgroundColor: '#FFD700',
  },
  filterOptionText: {
    color: '#fff',
    fontSize: 14,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalButton: {
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flex: 1,
    marginHorizontal: 5,
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  resetButton: {
    backgroundColor: '#FF6B6B',
  },
  cancelButton: {
    backgroundColor: '#666',
  },
  applyButton: {
    backgroundColor: '#007AFF',
  },
});
