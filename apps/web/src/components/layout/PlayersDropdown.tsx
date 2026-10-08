import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Paragraph, XStack, YStack } from '@legacy-sports/shared-components/ui';
import { Text } from '@legacy-sports/ui-abstractions';
import { ArrowLeftRight } from '@tamagui/lucide-icons/icons/ArrowLeftRight';
import { ChevronDown } from '@tamagui/lucide-icons/icons/ChevronDown';
import { ChevronUp } from '@tamagui/lucide-icons/icons/ChevronUp';
import { Users } from '@tamagui/lucide-icons/icons/Users';
import {
  parseDefaultSport,
  USER_PREFERENCES_STORAGE_KEY,
} from '@legacy-sports/shared-components/utils';
import {
  DROPDOWN_BORDER,
  DropdownButton,
  DropdownContent,
  FONT_BODY,
  FONT_DISPLAY,
  MenuItem,
  NAV_DROPDOWN_ANIMATION,
} from './NavDropdownShared';
import { BRAND_GOLD, TEXT_MUTED } from '../../constants/colors';
import { NAV_DROPDOWN_Z_INDEX } from '../../constants/dimensions';
import { useFeatureValue } from '../../context/GrowthBookProvider';

const MLB_COMPARE_PATH = '/players/compare';
const NFL_COMPARE_PATH = '/football/players/compare';

function prefersFootball(): boolean {
  try {
    return (
      parseDefaultSport(localStorage.getItem(USER_PREFERENCES_STORAGE_KEY)) ===
      'football'
    );
  } catch {
    return false;
  }
}

/**
 * Resolve the Compare destination for the sport the user is looking at
 * (LS-10677). /players/compare is MLB-only, so an NFL viewer must land on the
 * football comparison instead. Mirrors PlayerStatsRoute's sport resolution:
 * an explicit `sport` param on /players wins, any /football route is NFL, and
 * otherwise the saved default-sport preference decides.
 */
export function resolveCompareHref(
  pathname: string,
  search: string,
  footballEnabled: boolean,
): string {
  if (!footballEnabled) return MLB_COMPARE_PATH;
  if (pathname.startsWith('/football/')) return NFL_COMPARE_PATH;
  if (pathname === MLB_COMPARE_PATH) return MLB_COMPARE_PATH;
  const sportParam =
    pathname === '/players' ? new URLSearchParams(search).get('sport') : null;
  if (sportParam === 'nfl') return NFL_COMPARE_PATH;
  if (sportParam === 'mlb') return MLB_COMPARE_PATH;
  return prefersFootball() ? NFL_COMPARE_PATH : MLB_COMPARE_PATH;
}

// Item title style — Big Shoulders Display uppercase.
// Color passed separately via Tamagui `color` prop so it adapts to theme.
const titleStyle: React.CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontWeight: '700',
  fontSize: 12,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: 0,
};

// Item description style — Literata italic, always muted
const descStyle: React.CSSProperties = {
  fontFamily: FONT_BODY,
  fontStyle: 'italic',
  fontSize: 11,
  color: TEXT_MUTED,
  marginTop: 3,
  marginBottom: 0,
};

export const PlayersDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const buttonId = 'players-menu-button';
  const menuId = 'players-menu';
  const footballEnabled = useFeatureValue('football_enabled', true);
  const compareHref = resolveCompareHref(
    location.pathname,
    location.search,
    footballEnabled !== false,
  );
  const isCompareActive =
    location.pathname === MLB_COMPARE_PATH ||
    location.pathname === NFL_COMPARE_PATH;

  const isActive = location.pathname === '/players' || isCompareActive;
  const isHighlighted = isActive || isOpen;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      document.getElementById(buttonId)?.focus();
      return;
    }
    if (!isOpen) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const menu = document.getElementById(menuId);
      if (!menu) return;
      const items = Array.from(
        menu.querySelectorAll<HTMLElement>('[role="menuitem"]'),
      );
      if (items.length === 0) return;
      const currentIndex = items.findIndex(
        (el) =>
          el === document.activeElement || el.contains(document.activeElement),
      );
      const nextIndex =
        e.key === 'ArrowDown'
          ? currentIndex < items.length - 1
            ? currentIndex + 1
            : 0
          : currentIndex > 0
            ? currentIndex - 1
            : items.length - 1;
      items[nextIndex]?.focus();
    }
  };

  return (
    <YStack
      position="relative"
      flexShrink={0}
      ref={dropdownRef}
      onKeyDown={onKeyDown}
    >
      <DropdownButton
        highlight={isHighlighted}
        onPress={() => setIsOpen(!isOpen)}
        id={buttonId}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
      >
        <Users size={15} />
        <Text>Players</Text>
        {isOpen ? (
          <ChevronUp size={14} color="$colorPress" />
        ) : (
          <ChevronDown size={14} color="$colorPress" />
        )}
      </DropdownButton>

      {isOpen && (
        <DropdownContent
          position="absolute"
          top="100%"
          left={0}
          marginTop="$2"
          zIndex={NAV_DROPDOWN_Z_INDEX}
          role="menu"
          id={menuId}
          aria-labelledby={buttonId}
          style={{
            borderColor: DROPDOWN_BORDER,
            animation: NAV_DROPDOWN_ANIMATION,
          }}
        >
          <Link
            to="/players"
            style={{ textDecoration: 'none', display: 'block' }}
          >
            <MenuItem
              onPress={() => setIsOpen(false)}
              role="menuitem"
              active={location.pathname === '/players'}
            >
              <XStack alignItems="flex-start" gap={12} flex={1}>
                <Users
                  size={17}
                  color={
                    location.pathname === '/players' ? BRAND_GOLD : TEXT_MUTED
                  }
                  style={{ flexShrink: 0, marginTop: 1 }}
                />
                <YStack flex={1} gap={0}>
                  <Paragraph
                    color={
                      location.pathname === '/players' ? BRAND_GOLD : '$color'
                    }
                    style={titleStyle}
                  >
                    All Players
                  </Paragraph>
                  <Paragraph style={descStyle}>
                    Browse the full roster
                  </Paragraph>
                </YStack>
              </XStack>
            </MenuItem>
          </Link>

          <Link
            to={compareHref}
            style={{ textDecoration: 'none', display: 'block' }}
          >
            <MenuItem
              onPress={() => setIsOpen(false)}
              role="menuitem"
              active={isCompareActive}
            >
              <XStack alignItems="flex-start" gap={12} flex={1}>
                <ArrowLeftRight
                  size={17}
                  color={isCompareActive ? BRAND_GOLD : TEXT_MUTED}
                  style={{ flexShrink: 0, marginTop: 1 }}
                />
                <YStack flex={1} gap={0}>
                  <Paragraph
                    color={isCompareActive ? BRAND_GOLD : '$color'}
                    style={titleStyle}
                  >
                    Compare Players
                  </Paragraph>
                  <Paragraph style={descStyle}>
                    Side-by-side stat comparison
                  </Paragraph>
                </YStack>
              </XStack>
            </MenuItem>
          </Link>
        </DropdownContent>
      )}
    </YStack>
  );
};
