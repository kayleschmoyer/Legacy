import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Paragraph, XStack, YStack } from '@legacy-sports/shared-components/ui';
import { Text } from '@legacy-sports/ui-abstractions';
import { ChevronDown, ChevronUp, Globe, Grid2x2 } from '@tamagui/lucide-icons';
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
import { BaseballIcon, FootballIcon } from '../icons/SportIcons';

// Color passed separately via Tamagui `color` prop so it adapts to theme.
const titleStyle: React.CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontWeight: '700',
  fontSize: 12,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: 0,
};

const descStyle: React.CSSProperties = {
  fontFamily: FONT_BODY,
  fontStyle: 'italic',
  fontSize: 11,
  color: TEXT_MUTED,
  marginTop: 3,
  marginBottom: 0,
};

export const SportsDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const buttonId = 'sports-menu-button';
  const menuId = 'sports-menu';

  const isActive =
    location.pathname === '/football' ||
    location.pathname.startsWith('/baseball');
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

  const isFootball = location.pathname === '/football';
  const isBaseball = location.pathname.startsWith('/baseball');
  const isLeagues = location.pathname === '/baseball/leagues';

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
        <Grid2x2 size={15} />
        <Text>Sports</Text>
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
            to="/football"
            style={{ textDecoration: 'none', display: 'block' }}
          >
            <MenuItem
              onPress={() => setIsOpen(false)}
              role="menuitem"
              active={isFootball}
            >
              <XStack alignItems="flex-start" gap={12} flex={1}>
                <YStack flexShrink={0} marginTop={1}>
                  <FootballIcon
                    size={17}
                    color={isFootball ? BRAND_GOLD : TEXT_MUTED}
                  />
                </YStack>
                <YStack flex={1} gap={0}>
                  <Paragraph
                    color={isFootball ? BRAND_GOLD : '$color'}
                    style={titleStyle}
                  >
                    Football
                  </Paragraph>
                  <Paragraph style={descStyle}>NFL fantasy leagues</Paragraph>
                </YStack>
              </XStack>
            </MenuItem>
          </Link>

          <Link
            to="/baseball"
            style={{ textDecoration: 'none', display: 'block' }}
          >
            <MenuItem
              onPress={() => setIsOpen(false)}
              role="menuitem"
              active={isBaseball}
            >
              <XStack alignItems="flex-start" gap={12} flex={1}>
                <YStack flexShrink={0} marginTop={1}>
                  <BaseballIcon
                    size={17}
                    color={isBaseball ? BRAND_GOLD : TEXT_MUTED}
                  />
                </YStack>
                <YStack flex={1} gap={0}>
                  <Paragraph
                    color={isBaseball ? BRAND_GOLD : '$color'}
                    style={titleStyle}
                  >
                    Baseball
                  </Paragraph>
                  <Paragraph style={descStyle}>MLB fantasy leagues</Paragraph>
                </YStack>
              </XStack>
            </MenuItem>
          </Link>

          <Link
            to="/baseball/leagues"
            style={{ textDecoration: 'none', display: 'block' }}
          >
            <MenuItem
              onPress={() => setIsOpen(false)}
              role="menuitem"
              active={isLeagues}
            >
              <XStack alignItems="flex-start" gap={12} flex={1}>
                <Globe
                  size={17}
                  color={isLeagues ? BRAND_GOLD : TEXT_MUTED}
                  style={{ flexShrink: 0, marginTop: 1 }}
                />
                <YStack flex={1} gap={0}>
                  <Paragraph
                    color={isLeagues ? BRAND_GOLD : '$color'}
                    style={titleStyle}
                  >
                    Browse Leagues
                  </Paragraph>
                  <Paragraph style={descStyle}>Join a public league</Paragraph>
                </YStack>
              </XStack>
            </MenuItem>
          </Link>
        </DropdownContent>
      )}
    </YStack>
  );
};
