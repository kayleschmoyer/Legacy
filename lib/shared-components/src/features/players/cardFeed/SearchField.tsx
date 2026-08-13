import React from 'react';
import { Input, XStack } from 'tamagui';
import { Search } from '@tamagui/lucide-icons/icons/Search';
import {
  STATS_BORDER,
  SURFACE_PANEL,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
} from '../../../utils/colors';
import { FONT_BODY } from '../shell/tokens';

export interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  testID?: string;
}

/**
 * Always-visible live search field for the Players card feed (LS-8832,
 * design handoff option 1c) — no Apply button; the screen wiring debounces
 * and gates the committed term on the 2-char minimum before querying.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search players',
  testID = 'players-card-feed-search',
}: SearchFieldProps) {
  return (
    <XStack position="relative" alignItems="center" minHeight={44}>
      <XStack position="absolute" left={12} zIndex={1}>
        <Search size={16} color={TEXT_TERTIARY} strokeWidth={2} />
      </XStack>
      <Input
        testID={testID}
        flex={1}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={TEXT_TERTIARY}
        backgroundColor={SURFACE_PANEL}
        borderWidth={1}
        borderColor={STATS_BORDER}
        borderRadius={10}
        minHeight={44}
        paddingLeft={38}
        paddingRight={12}
        fontFamily={FONT_BODY}
        fontSize={14}
        color={TEXT_PRIMARY}
        accessibilityLabel="Search players"
      />
    </XStack>
  );
}

export default SearchField;
