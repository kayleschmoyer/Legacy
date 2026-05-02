import React from 'react';
import { Text, XStack, YStack } from 'tamagui';

export interface NavLink {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

export interface NavBarProps {
  /** Wordmark text. */
  brand?: string;
  /** Optional brand glyph (logo SVG / Image). */
  logo?: React.ReactNode;
  links: NavLink[];
  /** Right-edge slot — typically Search + NotificationBell + Avatar. */
  trailing?: React.ReactNode;
}

/**
 * Sticky top nav. 56px tall, glass-blurred page background, navy
 * underline indicator on the active link.
 */
export function NavBar({
  brand = 'Legacy Sports',
  logo,
  links,
  trailing,
}: NavBarProps): React.JSX.Element {
  return (
    <XStack
      alignItems="center"
      justifyContent="space-between"
      height={56}
      paddingHorizontal="$4"
      gap="$4"
      backgroundColor="$background075"
      borderBottomWidth={1}
      borderColor="$glassBorder"
      style={{ backdropFilter: 'blur(14px)' } as never}
      position="sticky"
      top={0}
      zIndex={100}
    >
      <XStack alignItems="center" gap="$2">
        {logo}
        <Text
          fontFamily="$heading"
          fontWeight="800"
          fontSize={18}
          letterSpacing={0.4}
          color="$brandGold"
        >
          {brand}
        </Text>
      </XStack>

      <XStack
        gap="$5"
        alignItems="center"
        flex={1}
        justifyContent="center"
        $sm={{ display: 'none' }}
      >
        {links.map((l) => (
          <YStack
            key={l.label}
            alignItems="center"
            gap={4}
            cursor="pointer"
            onPress={l.onPress}
          >
            <Text
              fontFamily="$heading"
              fontWeight={l.active ? '800' : '700'}
              fontSize={13}
              letterSpacing={0.6}
              textTransform="uppercase"
              color={l.active ? '$color12' : '$textMuted'}
              hoverStyle={{ color: '$color12' } as never}
            >
              {l.label}
            </Text>
            <YStack
              height={2}
              width="100%"
              backgroundColor={l.active ? '$brandGold' : 'transparent'}
              borderRadius={9999}
            />
          </YStack>
        ))}
      </XStack>

      <XStack gap="$2" alignItems="center">
        {trailing}
      </XStack>
    </XStack>
  );
}
