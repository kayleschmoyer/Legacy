import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

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
    currentFilters
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
        renderItem={({ item: option }) => (
          <TouchableOpacity
            style={[
              styles.filterOption,
              item.value === option.value ? styles.filterOptionSelected : null,
            ]}
            onPress={() =>
              handleFilterChange(item.label.toLowerCase(), option.value)
            }
          >
            <Text style={styles.filterOptionText}>{option.label}</Text>
          </TouchableOpacity>
        )}
        keyExtractor={(item) => item.value || 'null'}
      />
    </View>
  );

  return (
    <View>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search players..."
          value={value}
          onChangeText={handleSearch}
        />
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilterModal(true)}
        >
          <MaterialIcons name="filter-list" size={24} color="white" />
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
              data={filterOptions}
              renderItem={renderFilterOption}
              keyExtractor={(item) => item.label}
            />
            <View style={styles.modalButtons}>
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
};

const styles = StyleSheet.create({
  applyButton: {
    backgroundColor: '#007AFF',
  },
  cancelButton: {
    backgroundColor: '#666',
  },
  filterButton: {
    padding: 10,
  },
  filterOption: {
    backgroundColor: '#333',
    borderRadius: 5,
    marginRight: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterOptionButton: {
    backgroundColor: '#444',
    borderRadius: 5,
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterOptionButtonText: {
    color: '#fff',
  },
  filterOptionContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 10,
  },
  filterOptionLabel: {
    color: '#fff',
    marginRight: 10,
  },
  filterOptionSelected: {
    backgroundColor: '#555',
  },
  filterOptionText: {
    color: '#fff',
  },
  modalButton: {
    borderRadius: 5,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
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
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  searchContainer: {
    alignItems: 'center',
    backgroundColor: '#333',
    borderRadius: 25,
    flexDirection: 'row',
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  searchInput: {
    color: '#fff',
    flex: 1,
    height: 40,
    paddingHorizontal: 10,
  },
});

export default SearchBar;
