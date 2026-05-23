import React from 'react';
import { Text, XStack } from 'tamagui';
import type { BrandIconName } from './icons/BrandIcon';
import { BrandIcon } from './icons/BrandIcon';
import { BRAND_NAVY, TEXT_HIGH_CONTRAST, TEXT_MUTED } from '../utils/colors';

export type { BrandIconName };

export interface NavLink {
  label: string;
  icon?: BrandIconName;
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

      {/* Pill nav — matches components-nav.html spec */}
      <XStack
        alignItems="center"
        gap={4}
        paddingHorizontal={6}
        paddingVertical={6}
        borderRadius={9999}
        borderWidth={1}
        borderColor="$outlineSubtle"
        backgroundColor="$surfacePanel"
        flex={1}
        justifyContent="center"
        $sm={{ display: 'none' }}
      >
        {links.map((l) => (
          <NavPill key={l.label} link={l} />
        ))}
      </XStack>

      <XStack gap="$2" alignItems="center">
        {trailing}
      </XStack>
    </XStack>
  );
}

function NavPill({ link }: { link: NavLink }) {
  const [hovered, setHovered] = React.useState(false);

  const textColor = link.active
    ? '#ffffff'
    : hovered
      ? TEXT_HIGH_CONTRAST
      : TEXT_MUTED;

  return (
    <XStack
      alignItems="center"
      gap={7}
      paddingHorizontal={16}
      paddingVertical={9}
      borderRadius={9999}
      cursor="pointer"
      onPress={link.onPress}
      style={
        {
          background: link.active ? BRAND_NAVY : 'transparent',
          transition: 'background 120ms ease-out',
          userSelect: 'none',
        } as never
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {link.icon ? (
        <BrandIcon
          name={link.icon}
          size={16}
          color={textColor}
          accentColor={textColor}
          style={{
            opacity: link.active ? 1 : 0.8,
            transition: 'color 120ms ease-out',
          }}
        />
      ) : null}
      <Text
        fontFamily="$heading"
        fontWeight="700"
        fontSize={13}
        letterSpacing={0.78}
        textTransform="uppercase"
        style={
          { color: textColor, transition: 'color 120ms ease-out' } as never
        }
      >
        {link.label}
      </Text>
    </XStack>
  );
}
