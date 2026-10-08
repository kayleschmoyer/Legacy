import React from 'react';
import { Text, XStack } from 'tamagui';
import type { BrandIconName } from './icons/BrandIcon';
import { BrandIcon } from './icons/BrandIcon';
import { handleKeyActivate } from '../utils/keyboardActivation';
import { Platform } from '../platform-components';

export type { BrandIconName };

export interface NavLink {
  label: string;
  icon?: BrandIconName;
  active?: boolean;
  onPress?: () => void;
  /**
   * Route path for this link. When provided, the pill exposes `role="link"`
   * (matching `getByRole('link', ...)`) instead of the default
   * `role="button"` — this is a navigational destination, not an action.
   * On web it also renders as a real `<a href>` so open-in-new-tab,
   * Ctrl/Cmd/middle-click and copy-link work (LS-10779).
   */
  href?: string;
}

export interface NavBarProps {
  /** Wordmark text. Pass '' to render only `logo` (no default text). */
  brand?: string;
  /** Optional brand glyph (logo SVG / Image). */
  logo?: React.ReactNode;
  links: NavLink[];
  /** Slot rendered between the brand and the pill link group — e.g. a league switcher. */
  afterBrand?: React.ReactNode;
  /** Right-edge slot — typically Search + NotificationBell + Avatar. */
  trailing?: React.ReactNode;
}

export function NavBar({
  brand = 'Legacy Sports',
  logo,
  links,
  afterBrand,
  trailing,
}: NavBarProps): React.JSX.Element {
  return (
    <XStack
      alignItems="center"
      justifyContent="space-between"
      width="100%"
      height={56}
      paddingHorizontal="$4"
      gap="$4"
      backgroundColor="$background075"
      borderBottomWidth={1}
      borderColor="$glassBorder"
      style={{ backdropFilter: 'blur(14px)' }}
      position="sticky"
      top={0}
      zIndex={100}
    >
      <XStack alignItems="center" gap="$2">
        {logo}
        {brand ? (
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={18}
            letterSpacing={0.4}
            color="$brandGold"
          >
            {brand}
          </Text>
        ) : null}
      </XStack>

      {afterBrand}

      {/* Pill nav — matches components-nav.html spec */}
      {links.length > 0 ? (
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
      ) : (
        // No links (e.g. the signed-out header): no empty pill track — just
        // push `trailing` to the right edge.
        <XStack flex={1} />
      )}

      <XStack gap="$2" alignItems="center">
        {trailing}
      </XStack>
    </XStack>
  );
}

interface PressEventLike {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  preventDefault?: () => void;
}

/**
 * Click handler for a web anchor pill: modified or non-primary clicks are left
 * to the browser (new tab / window), while a plain click is turned into an
 * in-app SPA navigation via `onPress` with the full-page load prevented.
 */
function handleAnchorPress(onPress: (() => void) | undefined) {
  return (e: PressEventLike) => {
    if (
      (e.button != null && e.button !== 0) ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    e.preventDefault?.();
    onPress?.();
  };
}

function NavPill({ link }: { link: NavLink }) {
  const [hovered, setHovered] = React.useState(false);
  const asAnchor = Platform.OS === 'web' && link.href != null;

  // Text/background render through real Tamagui props below, so a `$token`
  // string is all they need — Tamagui resolves it per-theme, cross-platform.
  const textColorToken = link.active
    ? '$textOnAccent'
    : hovered
      ? '$color12'
      : '$textMuted';
  // BrandIcon renders raw SVG (bypasses Tamagui's own token resolution), so
  // it needs a literal color. CSS custom properties stay theme-aware on web;
  // native resolution lands with the theme-aware color helper (LS-8525) — see
  // .agents/skills/ui/SKILL.md § Raw-CSS Strings.
  const iconColorVar = link.active
    ? 'var(--textOnAccent)'
    : hovered
      ? 'var(--color12)'
      : 'var(--textMuted)';

  return (
    <XStack
      alignItems="center"
      gap={7}
      paddingHorizontal={16}
      paddingVertical={9}
      borderRadius={9999}
      cursor="pointer"
      {...(asAnchor
        ? {
            tag: 'a',
            href: link.href,
            onPress: handleAnchorPress(link.onPress),
          }
        : { onPress: link.onPress })}
      role={link.href ? 'link' : 'button'}
      tabIndex={0}
      onKeyDown={handleKeyActivate(link.onPress)}
      backgroundColor={link.active ? '$brandNavy' : 'transparent'}
      style={
        {
          transition: 'background 120ms ease-out',
          userSelect: 'none',
          textDecoration: 'none',
        } as never
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {link.icon ? (
        <BrandIcon
          name={link.icon}
          size={16}
          color={iconColorVar}
          accentColor={iconColorVar}
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
        color={textColorToken}
        style={{ transition: 'color 120ms ease-out' }}
      >
        {link.label}
      </Text>
    </XStack>
  );
}
