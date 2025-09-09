import React, { useRef } from 'react';
import {
  Animated,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmit?: () => void;
  variant?: 'default' | 'compact' | 'prominent';
  showSearchIcon?: boolean;
  showClearButton?: boolean;
  autoFocus?: boolean;
}

export interface SearchSuggestion {
  id: string;
  text: string;
  subtitle?: string;
  type?: string;
}

export interface SearchWithSuggestionsProps extends SearchBarProps {
  suggestions: SearchSuggestion[];
  onSuggestionPress: (suggestion: SearchSuggestion) => void;
  maxSuggestions?: number;
  showSuggestions?: boolean;
}

export interface SortOption {
  key: string;
  label: string;
  direction?: 'asc' | 'desc';
}

export interface SortSelectorProps {
  options: SortOption[];
  selectedSort: string;
  onSortChange: (sortKey: string) => void;
  variant?: 'dropdown' | 'tabs' | 'chips';
  label?: string;
}

export interface SearchAndSortBarProps {
  searchValue: string;
  onSearchChange: (text: string) => void;
  sortOptions: SortOption[];
  selectedSort: string;
  onSortChange: (sortKey: string) => void;
  onFilterPress?: () => void;
  placeholder?: string;
  showFilterButton?: boolean;
  variant?: 'default' | 'compact';
}

/**
 * Enhanced Search Bar Component
 */
export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search...',
  onFocus,
  onBlur,
  onSubmit,
  variant = 'default',
  showSearchIcon = true,
  showClearButton = true,
  autoFocus = false,
}: SearchBarProps): JSX.Element {
  const inputRef = useRef<TextInput>(null);
  const focusAnim = useRef(new Animated.Value(0)).current;

  const handleFocus = () => {
    Animated.timing(focusAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
    onFocus?.();
  };

  const handleBlur = () => {
    Animated.timing(focusAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
    onBlur?.();
  };

  const handleClear = () => {
    onChangeText('');
    inputRef.current?.focus();
  };

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#374151', '#3b82f6'],
  });

  const containerStyle = [
    styles.searchContainer,
    styles[`${variant}Container`],
  ];

  return (
    <Animated.View style={[containerStyle, { borderColor }]}>
      {showSearchIcon && <Text style={styles.searchIcon}>🔍</Text>}

      <TextInput
        ref={inputRef}
        style={[styles.searchInput, styles[`${variant}Input`]]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        onFocus={handleFocus}
        onBlur={handleBlur}
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        returnKeyType="search"
      />

      {showClearButton && value.length > 0 && (
        <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
          <Text style={styles.clearIcon}>✕</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

/**
 * Search with Suggestions Component
 */
export function SearchWithSuggestions({
  suggestions,
  onSuggestionPress,
  maxSuggestions = 5,
  showSuggestions = true,
  ...searchProps
}: SearchWithSuggestionsProps): JSX.Element {
  const visibleSuggestions = suggestions.slice(0, maxSuggestions);
  const showSuggestionsList =
    showSuggestions &&
    searchProps.value.length > 0 &&
    visibleSuggestions.length > 0;

  const renderSuggestion = ({ item }: { item: SearchSuggestion }) => (
    <TouchableOpacity
      style={styles.suggestionItem}
      onPress={() => onSuggestionPress(item)}
    >
      <View style={styles.suggestionContent}>
        <Text style={styles.suggestionText}>{item.text}</Text>
        {item.subtitle && (
          <Text style={styles.suggestionSubtitle}>{item.subtitle}</Text>
        )}
      </View>
      {item.type && <Text style={styles.suggestionType}>{item.type}</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={styles.searchWithSuggestions}>
      <SearchBar {...searchProps} />

      {showSuggestionsList && (
        <View style={styles.suggestionsContainer}>
          <FlatList
            data={visibleSuggestions}
            keyExtractor={(item) => item.id}
            renderItem={renderSuggestion}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      )}
    </View>
  );
}

/**
 * Sort Selector Component
 */
export function SortSelector({
  options,
  selectedSort,
  onSortChange,
  variant = 'dropdown',
  label = 'Sort by',
}: SortSelectorProps): JSX.Element {
  const selectedOption = options.find((opt) => opt.key === selectedSort);

  if (variant === 'tabs') {
    return (
      <View style={styles.sortTabs}>
        {label && <Text style={styles.sortLabel}>{label}</Text>}
        <View style={styles.sortTabsContainer}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.sortTab,
                selectedSort === option.key && styles.sortTabActive,
              ]}
              onPress={() => onSortChange(option.key)}
            >
              <Text
                style={[
                  styles.sortTabText,
                  selectedSort === option.key && styles.sortTabTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  if (variant === 'chips') {
    return (
      <View style={styles.sortChips}>
        {label && <Text style={styles.sortLabel}>{label}</Text>}
        <View style={styles.sortChipsContainer}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.sortChip,
                selectedSort === option.key && styles.sortChipActive,
              ]}
              onPress={() => onSortChange(option.key)}
            >
              <Text
                style={[
                  styles.sortChipText,
                  selectedSort === option.key && styles.sortChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  // Default dropdown variant
  return (
    <View style={styles.sortDropdown}>
      {label && <Text style={styles.sortLabel}>{label}</Text>}
      <TouchableOpacity style={styles.sortDropdownButton}>
        <Text style={styles.sortDropdownText}>
          {selectedOption?.label || 'Select...'}
        </Text>
        <Text style={styles.sortDropdownArrow}>▼</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Combined Search and Sort Bar
 */
export function SearchAndSortBar({
  searchValue,
  onSearchChange,
  sortOptions,
  selectedSort,
  onSortChange,
  onFilterPress,
  placeholder = 'Search players...',
  showFilterButton = true,
  variant = 'default',
}: SearchAndSortBarProps): JSX.Element {
  const containerStyle = [
    styles.searchAndSortContainer,
    styles[`${variant}SearchAndSort`],
  ];

  return (
    <View style={containerStyle}>
      <View style={styles.searchSection}>
        <SearchBar
          value={searchValue}
          onChangeText={onSearchChange}
          placeholder={placeholder}
          variant={variant === 'compact' ? 'compact' : 'default'}
        />
      </View>

      <View style={styles.controlsSection}>
        <SortSelector
          options={sortOptions}
          selectedSort={selectedSort}
          onSortChange={onSortChange}
          variant="chips"
        />

        {showFilterButton && onFilterPress && (
          <TouchableOpacity style={styles.filterButton} onPress={onFilterPress}>
            <Text style={styles.filterButtonIcon}>⚙</Text>
            <Text style={styles.filterButtonText}>Filter</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Search Bar
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },

  defaultContainer: {
    minHeight: 48,
  },

  compactContainer: {
    minHeight: 40,
    borderRadius: 8,
  },

  prominentContainer: {
    minHeight: 56,
    borderRadius: 16,
  },

  searchIcon: {
    fontSize: 16,
    color: '#9ca3af',
    marginRight: 8,
  },

  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    padding: 0,
  },

  defaultInput: {
    fontSize: 16,
  },

  compactInput: {
    fontSize: 14,
  },

  prominentInput: {
    fontSize: 18,
  },

  clearButton: {
    padding: 4,
    marginLeft: 8,
  },

  clearIcon: {
    fontSize: 14,
    color: '#9ca3af',
  },

  // Search with Suggestions
  searchWithSuggestions: {
    position: 'relative',
  },

  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 200,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 1000,
  },

  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },

  suggestionContent: {
    flex: 1,
  },

  suggestionText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '500',
  },

  suggestionSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },

  suggestionType: {
    fontSize: 10,
    color: '#6b7280',
    backgroundColor: '#374151',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  // Sort Selector
  sortDropdown: {
    minWidth: 120,
  },

  sortLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
  },

  sortDropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },

  sortDropdownText: {
    fontSize: 14,
    color: '#ffffff',
  },

  sortDropdownArrow: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 8,
  },

  // Sort Tabs
  sortTabs: {
    flex: 1,
  },

  sortTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 2,
  },

  sortTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },

  sortTabActive: {
    backgroundColor: '#3b82f6',
  },

  sortTabText: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
  },

  sortTabTextActive: {
    color: '#ffffff',
  },

  // Sort Chips
  sortChips: {
    flex: 1,
  },

  sortChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },

  sortChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#374151',
  },

  sortChipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },

  sortChipText: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500',
  },

  sortChipTextActive: {
    color: '#ffffff',
  },

  // Search and Sort Bar
  searchAndSortContainer: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  defaultSearchAndSort: {
    gap: 12,
  },

  compactSearchAndSort: {
    gap: 8,
    paddingVertical: 8,
  },

  searchSection: {
    flex: 1,
  },

  controlsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    gap: 6,
  },

  filterButtonIcon: {
    fontSize: 14,
    color: '#9ca3af',
  },

  filterButtonText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '500',
  },
});
