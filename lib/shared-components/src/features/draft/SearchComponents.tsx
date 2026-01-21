import React, { useRef } from 'react';
import type { TextInput } from 'react-native';
import { Search } from '@tamagui/lucide-icons';
import { Button, Input, Text, XStack, YStack } from 'tamagui';
import { Animated, FlatList } from '../../platform-components';

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
function SearchBar({
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
}: SearchBarProps) {
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

  const getContainerProps = () => {
    const baseProps = {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 12,
      paddingVertical: variant === 'prominent' ? 12 : 8,
      borderWidth: 1,
      borderColor: '#374151',
      borderRadius: variant === 'prominent' ? 12 : 8,
      backgroundColor: '$gray800',
      gap: 8,
    };

    return baseProps;
  };

  return (
    <XStack {...getContainerProps()}>
      {showSearchIcon && <Search size={20} color="#6b7280" />}

      <Input
        ref={inputRef}
        flex={1}
        fontSize={variant === 'prominent' ? 16 : 14}
        color="$white"
        backgroundColor="transparent"
        borderWidth={0}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        onFocus={handleFocus}
        onBlur={handleBlur}
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        returnKeyType="search"
        unstyled
      />

      {showClearButton && value.length > 0 && (
        <Button
          padding={4}
          onPress={handleClear}
          backgroundColor="transparent"
          unstyled
        >
          <Text fontSize={16} color="$gray400">
            ✕
          </Text>
        </Button>
      )}
    </XStack>
  );
}

/**
 * Search with Suggestions Component
 */
function SearchWithSuggestions({
  suggestions,
  onSuggestionPress,
  maxSuggestions = 5,
  showSuggestions = true,
  ...searchProps
}: SearchWithSuggestionsProps) {
  const visibleSuggestions = suggestions.slice(0, maxSuggestions);
  const showSuggestionsList =
    showSuggestions &&
    searchProps.value.length > 0 &&
    visibleSuggestions.length > 0;

  const renderSuggestion = ({ item }: { item: SearchSuggestion }) => (
    <Button
      paddingHorizontal={16}
      paddingVertical={12}
      backgroundColor="transparent"
      borderBottomWidth={1}
      borderBottomColor="$gray700"
      onPress={() => onSuggestionPress(item)}
      justifyContent="flex-start"
      unstyled
    >
      <XStack justifyContent="space-between" alignItems="center" flex={1}>
        <YStack flex={1}>
          <Text fontSize={14} color="$white" fontWeight="500">
            {item.text}
          </Text>
          {item.subtitle && (
            <Text fontSize={12} color="$gray400" marginTop={2}>
              {item.subtitle}
            </Text>
          )}
        </YStack>
        {item.type && (
          <Text
            fontSize={10}
            color="$gray500"
            backgroundColor="$gray700"
            paddingHorizontal={6}
            paddingVertical={2}
            borderRadius={4}
            fontWeight="500"
            textTransform="uppercase"
          >
            {item.type}
          </Text>
        )}
      </XStack>
    </Button>
  );

  return (
    <YStack>
      <SearchBar {...searchProps} />

      {showSuggestionsList && (
        <YStack
          backgroundColor="$gray800"
          borderWidth={1}
          borderColor="$gray700"
          borderTopWidth={0}
          borderBottomLeftRadius={8}
          borderBottomRightRadius={8}
          maxHeight={200}
        >
          <FlatList
            data={visibleSuggestions}
            keyExtractor={(item: SearchSuggestion) => item.id}
            renderItem={renderSuggestion}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        </YStack>
      )}
    </YStack>
  );
}

/**
 * Sort Selector Component
 */
function SortSelector({
  options,
  selectedSort,
  onSortChange,
  variant = 'dropdown',
  label = 'Sort by',
}: SortSelectorProps) {
  const selectedOption = options.find((opt) => opt.key === selectedSort);

  if (variant === 'tabs') {
    return (
      <YStack paddingHorizontal={16} paddingVertical={8}>
        {label && (
          <Text
            fontSize={12}
            fontWeight="600"
            color="$gray400"
            marginBottom={8}
          >
            {label}
          </Text>
        )}
        <XStack gap={8}>
          {options.map((option) => (
            <Button
              key={option.key}
              paddingHorizontal={16}
              paddingVertical={8}
              borderRadius={8}
              borderWidth={1}
              backgroundColor={
                selectedSort === option.key ? '$blue500' : 'transparent'
              }
              borderColor={
                selectedSort === option.key ? '$blue500' : '$gray600'
              }
              onPress={() => onSortChange(option.key)}
              unstyled
            >
              <Text
                fontSize={14}
                fontWeight="500"
                color={selectedSort === option.key ? '$white' : '$gray300'}
              >
                {option.label}
              </Text>
            </Button>
          ))}
        </XStack>
      </YStack>
    );
  }

  if (variant === 'chips') {
    return (
      <YStack paddingHorizontal={16} paddingVertical={8}>
        {label && (
          <Text
            fontSize={12}
            fontWeight="600"
            color="$gray400"
            marginBottom={8}
          >
            {label}
          </Text>
        )}
        <XStack flexWrap="wrap" gap={8}>
          {options.map((option) => (
            <Button
              key={option.key}
              paddingHorizontal={12}
              paddingVertical={6}
              borderRadius={16}
              borderWidth={1}
              backgroundColor={
                selectedSort === option.key ? '$blue500' : 'transparent'
              }
              borderColor={
                selectedSort === option.key ? '$blue500' : '$gray600'
              }
              onPress={() => onSortChange(option.key)}
              unstyled
            >
              <Text
                fontSize={12}
                fontWeight="500"
                color={selectedSort === option.key ? '$white' : '$gray300'}
              >
                {option.label}
              </Text>
            </Button>
          ))}
        </XStack>
      </YStack>
    );
  }

  // Default dropdown variant
  return (
    <YStack paddingHorizontal={16} paddingVertical={8}>
      {label && (
        <Text fontSize={12} fontWeight="600" color="$gray400" marginBottom={8}>
          {label}
        </Text>
      )}
      <Button
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        paddingHorizontal={12}
        paddingVertical={8}
        borderWidth={1}
        borderColor="$gray600"
        borderRadius={8}
        backgroundColor="$gray800"
        unstyled
      >
        <Text fontSize={14} color="$white">
          {selectedOption?.label || 'Select...'}
        </Text>
        <Text fontSize={12} color="$gray400">
          ▼
        </Text>
      </Button>
    </YStack>
  );
}

/**
 * Combined Search and Sort Bar
 */
function SearchAndSortBar({
  searchValue,
  onSearchChange,
  sortOptions,
  selectedSort,
  onSortChange,
  onFilterPress,
  placeholder = 'Search players...',
  showFilterButton = true,
  variant = 'default',
}: SearchAndSortBarProps) {
  return (
    <YStack
      paddingHorizontal={16}
      paddingVertical={variant === 'compact' ? 8 : 12}
      backgroundColor="$gray900"
      gap={variant === 'compact' ? 8 : 12}
    >
      <SearchBar
        value={searchValue}
        onChangeText={onSearchChange}
        placeholder={placeholder}
        variant={variant === 'compact' ? 'compact' : 'default'}
      />

      <XStack justifyContent="space-between" alignItems="center">
        <SortSelector
          options={sortOptions}
          selectedSort={selectedSort}
          onSortChange={onSortChange}
          variant="chips"
        />

        {showFilterButton && onFilterPress && (
          <Button
            flexDirection="row"
            alignItems="center"
            gap={4}
            paddingHorizontal={12}
            paddingVertical={8}
            borderRadius={8}
            backgroundColor="$gray700"
            onPress={onFilterPress}
            unstyled
          >
            <Text fontSize={14} color="$gray300">
              ⚙
            </Text>
            <Text fontSize={14} color="$gray300" fontWeight="500">
              Filter
            </Text>
          </Button>
        )}
      </XStack>
    </YStack>
  );
}

export { SearchBar };
export { SearchWithSuggestions };
export { SortSelector };
export { SearchAndSortBar };
