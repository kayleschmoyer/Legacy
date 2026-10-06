import React from 'react';
import { Text, YStack } from 'tamagui';
import { colors } from '@legacy-sports/design-tokens';

/**
 * Small pill toggle used to switch between baseball/football sport scope.
 *
 * Lives outside `app/` (not a route) so both `football/players.tsx` and the
 * native Players tab (`(tabs)/(players)/players.tsx`) can import just this atom
 * without pulling in either screen's heavier transitive graph (LS-9079).
 */
export function SportSwitcherPill({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}): React.JSX.Element {
  return (
    <YStack
      testID={testID}
      paddingHorizontal={14}
      paddingVertical={8}
      borderRadius={20}
      borderWidth={1}
      onPress={onPress}
      pressStyle={{ opacity: 0.7 }}
      backgroundColor={active ? `${colors.brand.navy}33` : '$glassSurface'}
      borderColor={active ? colors.brand.navy : '$glassBorder'}
      justifyContent="center"
      alignItems="center"
    >
      <Text
        fontSize={14}
        fontWeight="600"
        color={active ? colors.brand.navy : '$gray10'}
      >
        {label}
      </Text>
    </YStack>
  );
}
