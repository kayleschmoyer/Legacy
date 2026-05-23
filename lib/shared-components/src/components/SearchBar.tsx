import React, { useState } from 'react';
import { Input, Text, XStack, YStack } from 'tamagui';
import { BrandIcon } from './icons/BrandIcon';

// Dark-theme textMuted hex — used for the search icon color which requires
// a raw string (BrandIcon doesn't accept Tamagui token references).
const ICON_COLOR = '#9CAAC5';

export interface SearchBarResultItem {
  id: string;
  /** Two-letter initials rendered in the result avatar. */
  initials: string;
  name: string;
  /** Secondary metadata (e.g. "1927 · NYY · 60 HR"). */
  meta?: string;
  onPress?: () => void;
}

export interface SearchFilterChipData {
  id: string;
  label: string;
  active?: boolean;
  onPress?: () => void;
}

export interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** When > 0, shows the Filter button with the count badge. */
  filterCount?: number;
  onFilterPress?: () => void;
  /** Optional filter chips rendered below the input bar. */
  chips?: SearchFilterChipData[];
  /** Search results shown in a dropdown panel below the bar. */
  results?: SearchBarResultItem[];
  seeAllLabel?: string;
  onSeeAll?: () => void;
}

const handleKeyActivate =
  (fn: (() => void) | undefined) => (e: React.KeyboardEvent<HTMLElement>) => {
    if (fn != null && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.currentTarget.click();
    }
  };

function FilterChip({
  label,
  active = false,
  onPress,
}: SearchFilterChipData): React.JSX.Element {
  return (
    <XStack
      paddingVertical={5}
      paddingHorizontal={12}
      borderRadius={9999}
      backgroundColor={active ? '$brandNavy' : '$surfaceInteractive'}
      borderWidth={1}
      borderColor={active ? '$brandNavyLight' : '$outlineSubtle'}
      pressStyle={{ opacity: 0.8 }}
      onPress={onPress}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyActivate(onPress)}
      cursor="pointer"
      animation="fast"
    >
      <Text
        fontFamily="$heading"
        fontWeight="700"
        fontSize={11}
        letterSpacing={0.88}
        textTransform="uppercase"
        color={active ? '$textOnAccent' : '$color11'}
      >
        {label}
      </Text>
    </XStack>
  );
}

function ResultAvatar({ initials }: { initials: string }): React.JSX.Element {
  return (
    <XStack
      width={28}
      height={28}
      borderRadius={9999}
      backgroundColor="$brandNavy"
      borderWidth={1}
      borderColor="$brandNavyLight"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
    >
      <Text
        fontFamily="$heading"
        fontWeight="800"
        fontSize={11}
        color="$brandGoldLight"
      >
        {initials}
      </Text>
    </XStack>
  );
}

/**
 * Heritage-styled pill search bar matching the design-system spec.
 * Includes optional filter-count button, filter chips, and results dropdown.
 */
export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search players, teams, eras…',
  filterCount,
  onFilterPress,
  chips,
  results,
  seeAllLabel = 'See all results',
  onSeeAll,
}: SearchBarProps): React.JSX.Element {
  const [focused, setFocused] = useState(false);
  const showFilter = filterCount != null && filterCount > 0;

  return (
    <YStack gap={6}>
      {/* ── Pill bar ── */}
      <XStack
        backgroundColor="$surfaceCard"
        borderWidth={1}
        borderColor={focused ? '$focusRing' : '$outlineSubtle'}
        borderRadius={9999}
        paddingVertical={6}
        paddingLeft={16}
        paddingRight={showFilter ? 6 : 16}
        alignItems="center"
        gap={10}
        animation="fast"
        // Web-only focus ring spread
        style={
          focused
            ? { boxShadow: '0 0 0 3px rgba(96, 165, 250, 0.18)' }
            : undefined
        }
      >
        <BrandIcon name="search" size={16} color={ICON_COLOR} decorative />

        <Input
          unstyled
          flex={1}
          backgroundColor="transparent"
          borderWidth={0}
          fontFamily="$body"
          fontSize={14}
          color="$color"
          placeholderTextColor="$textMuted"
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />

        {showFilter && onFilterPress != null ? (
          <XStack
            paddingVertical={8}
            paddingHorizontal={14}
            borderRadius={9999}
            backgroundColor="$brandNavy"
            onPress={onFilterPress}
            role="button"
            tabIndex={0}
            onKeyDown={handleKeyActivate(onFilterPress)}
            pressStyle={{ opacity: 0.85 }}
            cursor="pointer"
            animation="fast"
          >
            <Text
              fontFamily="$heading"
              fontWeight="700"
              fontSize={11}
              letterSpacing={0.88}
              textTransform="uppercase"
              color="$textOnAccent"
            >
              {`Filter · ${filterCount}`}
            </Text>
          </XStack>
        ) : null}
      </XStack>

      {/* ── Filter chips ── */}
      {chips != null && chips.length > 0 ? (
        <XStack gap={6} flexWrap="wrap">
          {chips.map((chip) => (
            <FilterChip key={chip.id} {...chip} />
          ))}
        </XStack>
      ) : null}

      {/* ── Results dropdown ── */}
      {results != null && results.length > 0 ? (
        <YStack
          backgroundColor="$surfaceCard"
          borderWidth={1}
          borderColor="$outlineSubtle"
          borderRadius={12}
          padding={6}
          shadowColor="$shadowColor"
          shadowOffset={{ width: 0, height: 4 }}
          shadowRadius={12}
          shadowOpacity={1}
          elevation={8}
        >
          {results.map((item) => (
            <XStack
              key={item.id}
              alignItems="center"
              gap={10}
              paddingVertical={8}
              paddingHorizontal={10}
              borderRadius={8}
              hoverStyle={{ backgroundColor: '$backgroundHover' }}
              pressStyle={{ opacity: 0.85 }}
              onPress={item.onPress}
              role={item.onPress != null ? 'button' : undefined}
              tabIndex={item.onPress != null ? 0 : undefined}
              onKeyDown={handleKeyActivate(item.onPress)}
              cursor={item.onPress != null ? 'pointer' : 'default'}
              animation="fast"
            >
              <ResultAvatar initials={item.initials} />
              <Text fontFamily="$body" fontSize={14} color="$color" flex={1}>
                {item.name}
              </Text>
              {item.meta != null ? (
                <Text fontFamily="$mono" fontSize={11} color="$textMuted">
                  {item.meta}
                </Text>
              ) : null}
            </XStack>
          ))}

          {onSeeAll != null ? (
            <XStack
              alignItems="center"
              gap={10}
              paddingVertical={8}
              paddingHorizontal={10}
              borderRadius={8}
              hoverStyle={{ backgroundColor: '$backgroundHover' }}
              pressStyle={{ opacity: 0.85 }}
              onPress={onSeeAll}
              role="button"
              tabIndex={0}
              onKeyDown={handleKeyActivate(onSeeAll)}
              cursor="pointer"
              animation="fast"
            >
              <XStack
                width={28}
                height={28}
                borderRadius={9999}
                backgroundColor="$surfacePanel"
                borderWidth={1}
                borderColor="$outlineSubtle"
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
              >
                <Text
                  fontFamily="$heading"
                  fontWeight="700"
                  fontSize={14}
                  color="$textMuted"
                >
                  +
                </Text>
              </XStack>
              <Text fontFamily="$body" fontSize={14} color="$textMuted">
                {seeAllLabel}
              </Text>
            </XStack>
          ) : null}
        </YStack>
      ) : null}
    </YStack>
  );
}
