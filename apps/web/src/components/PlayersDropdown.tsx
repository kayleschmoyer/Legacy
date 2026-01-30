import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, YStack } from '@legacy-sports/shared-components';
import { Text } from '@legacy-sports/ui-abstractions';
import { styled } from 'tamagui';

const DropdownButton = styled(Button, {
  size: '$2',
  gap: '$2',
  width: '100%',
  backgroundColor: 'transparent',
  borderWidth: 1,
  borderColor: '$borderColor',
  hoverStyle: {
    backgroundColor: '$color2',
  },
  pressStyle: {
    backgroundColor: '$color3',
  },
  variants: {
    highlight: {
      true: {
        backgroundColor: '$blue9',
        borderColor: '$blue9',
        color: 'white',
      },
    },
  } as const,
});

const DropdownContent = styled(YStack, {
  backgroundColor: '$background',
  borderRadius: '$4',
  borderWidth: 1,
  borderColor: '$borderColor',
  padding: '$2',
  space: '$1',
  minWidth: 180,
  shadowColor: '$shadowColor',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.15,
  shadowRadius: 12,
  elevation: 8,
});

const MenuItem = styled(Button, {
  justifyContent: 'flex-start',
  backgroundColor: 'transparent',
  borderWidth: 0,
  padding: '$3',
  borderRadius: '$3',
  width: '100%',
  hoverStyle: {
    backgroundColor: '$color2',
  },
  pressStyle: {
    backgroundColor: '$color3',
  },
});

export const PlayersDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const buttonId = 'players-menu-button';
  const menuId = 'players-menu';

  const isActive =
    location.pathname === '/players' || location.pathname === '/players/stats';
  const isHighlighted = isActive || isOpen;

  // Use sport-specific accents when within a sport section
  const sportTone = location.pathname.startsWith('/baseball')
    ? 'baseball'
    : location.pathname === '/football'
      ? 'football'
      : 'neutral';
  const highlightBg =
    sportTone === 'baseball'
      ? '$sportBaseballPrimary'
      : sportTone === 'football'
        ? '$sportFootballPrimary'
        : '$blue9';

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
    if (e.key === 'Escape') setIsOpen(false);
  };

  return (
    <YStack position="relative" ref={dropdownRef} onKeyDown={onKeyDown}>
      <DropdownButton
        highlight={isHighlighted}
        backgroundColor={isHighlighted ? highlightBg : 'transparent'}
        borderColor={isHighlighted ? highlightBg : '$borderColor'}
        color={isHighlighted ? 'white' : undefined}
        onPress={() => setIsOpen(!isOpen)}
        id={buttonId}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
      >
        <span role="img" aria-label="Players icon">
          👥
        </span>
        <Text> </Text>
        <Text>Players {isOpen ? '▲' : '▼'}</Text>
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
          <Link to="/players" style={{ textDecoration: 'none' }}>
            <MenuItem onPress={() => setIsOpen(false)} role="menuitem">
              <span role="img" aria-label="players list">
                👤
              </span>{' '}
              All Players
            </MenuItem>
          </Link>

          <Link to="/players/stats" style={{ textDecoration: 'none' }}>
            <MenuItem onPress={() => setIsOpen(false)} role="menuitem">
              <span role="img" aria-label="statistics">
                📊
              </span>{' '}
              Player Stats
            </MenuItem>
          </Link>
        </DropdownContent>
      )}
    </YStack>
  );
};
