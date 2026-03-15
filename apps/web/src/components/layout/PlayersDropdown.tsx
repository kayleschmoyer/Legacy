import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Button,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { Text } from '@legacy-sports/ui-abstractions';
import { styled } from 'tamagui';
import {
  ArrowLeftRight,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Users,
} from '@tamagui/lucide-icons';
import { BRAND_NAVY_LIGHT } from '../../constants/colors';

const DropdownButton = styled(Button, {
  size: '$3',
  gap: '$2',
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderRadius: '$10',
  paddingHorizontal: '$4',
  hoverStyle: {
    backgroundColor: '$color3',
  },
  pressStyle: {
    backgroundColor: '$color4',
    scale: 0.97,
  },
  variants: {
    highlight: {
      true: {
        backgroundColor: '$color3',
        fontWeight: '600',
      },
    },
  } as const,
});

const DropdownContent = styled(YStack, {
  backgroundColor: '$background',
  borderRadius: '$5',
  borderWidth: 1,
  borderColor: '$borderColor',
  padding: '$4',
  gap: '$2',
  minWidth: 260,
  shadowColor: '$shadowColor',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.2,
  shadowRadius: 24,
  elevation: 12,
});

const MenuItem = styled(Button, {
  justifyContent: 'flex-start',
  backgroundColor: 'transparent',
  borderWidth: 0,
  paddingHorizontal: '$3',
  paddingVertical: '$3',
  borderRadius: '$4',
  width: '100%',
  gap: '$3',
  hoverStyle: {
    backgroundColor: '$color3',
  },
  pressStyle: {
    backgroundColor: '$color4',
  },
  variants: {
    active: {
      true: {
        backgroundColor: '$color2',
      },
    },
  } as const,
});

const MenuIconBox = styled(YStack, {
  width: 38,
  height: 38,
  borderRadius: '$3',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$color2',
  flexShrink: 0,
});

export const PlayersDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const buttonId = 'players-menu-button';
  const menuId = 'players-menu';

  const isActive =
    location.pathname === '/players' ||
    location.pathname === '/players/stats' ||
    location.pathname === '/players/compare';
  const isHighlighted = isActive || isOpen;

  // Click outside handler
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
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      // Return focus to the trigger button
      const btn = document.getElementById(buttonId);
      btn?.focus();
      return;
    }
    if (!isOpen) return;
    // Arrow key navigation within menu items
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
      let nextIndex: number;
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      }
      items[nextIndex]?.focus();
    }
  };

  return (
    <YStack position="relative" ref={dropdownRef} onKeyDown={onKeyDown}>
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
          zIndex={100}
          role="menu"
          id={menuId}
          aria-labelledby={buttonId}
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
              <XStack alignItems="center" gap="$3" flex={1}>
                <MenuIconBox>
                  <Users size={20} color="$color" />
                </MenuIconBox>
                <YStack flex={1} gap="$1">
                  <Paragraph size="$4" color="$color" fontWeight="500">
                    All Players
                  </Paragraph>
                  <Paragraph size="$2" color="$colorPress">
                    Browse the full roster
                  </Paragraph>
                </YStack>
                {location.pathname === '/players' && (
                  <YStack
                    width={6}
                    height={6}
                    borderRadius={3}
                    backgroundColor={BRAND_NAVY_LIGHT}
                  />
                )}
              </XStack>
            </MenuItem>
          </Link>

          <Link
            to="/players/stats"
            style={{ textDecoration: 'none', display: 'block' }}
          >
            <MenuItem
              onPress={() => setIsOpen(false)}
              role="menuitem"
              active={location.pathname === '/players/stats'}
            >
              <XStack alignItems="center" gap="$3" flex={1}>
                <MenuIconBox>
                  <BarChart2 size={20} color="$color" />
                </MenuIconBox>
                <YStack flex={1} gap="$1">
                  <Paragraph size="$4" color="$color" fontWeight="500">
                    Player Stats
                  </Paragraph>
                  <Paragraph size="$2" color="$colorPress">
                    Rankings &amp; performance
                  </Paragraph>
                </YStack>
                {location.pathname === '/players/stats' && (
                  <YStack
                    width={6}
                    height={6}
                    borderRadius={3}
                    backgroundColor={BRAND_NAVY_LIGHT}
                  />
                )}
              </XStack>
            </MenuItem>
          </Link>

          <Link
            to="/players/compare"
            style={{ textDecoration: 'none', display: 'block' }}
          >
            <MenuItem
              onPress={() => setIsOpen(false)}
              role="menuitem"
              active={location.pathname === '/players/compare'}
            >
              <XStack alignItems="center" gap="$3" flex={1}>
                <MenuIconBox>
                  <ArrowLeftRight size={20} color="$color" />
                </MenuIconBox>
                <YStack flex={1} gap="$1">
                  <Paragraph size="$4" color="$color" fontWeight="500">
                    Compare Players
                  </Paragraph>
                  <Paragraph size="$2" color="$colorPress">
                    Side-by-side stat comparison
                  </Paragraph>
                </YStack>
                {location.pathname === '/players/compare' && (
                  <YStack
                    width={6}
                    height={6}
                    borderRadius={3}
                    backgroundColor={BRAND_NAVY_LIGHT}
                  />
                )}
              </XStack>
            </MenuItem>
          </Link>
        </DropdownContent>
      )}
    </YStack>
  );
};
