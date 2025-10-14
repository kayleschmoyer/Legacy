import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, YStack } from '@legacy-sports/shared-components';
import { styled } from 'tamagui';

const DropdownButton = styled(Button, {
  size: '$3',
  gap: '$2',
  width: '100%',
  variants: {
    isActive: {
      true: {
        backgroundColor: '$blue9',
        color: 'white',
      },
      false: {
        backgroundColor: '$gray4',
        color: '$color',
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

export const SportsDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const isActive =
    location.pathname === '/football' ||
    location.pathname.startsWith('/baseball');

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

  return (
    <YStack position="relative" ref={dropdownRef}>
      <DropdownButton isActive={isActive} onPress={() => setIsOpen(!isOpen)}>
        <span role="img" aria-label="sports">
          🏆
        </span>{' '}
        Sports {isOpen ? '▲' : '▼'}
      </DropdownButton>

      {isOpen && (
        <DropdownContent
          position="absolute"
          top="100%"
          left={0}
          marginTop="$2"
          zIndex={100}
        >
          <Link to="/football" style={{ textDecoration: 'none' }}>
            <MenuItem onPress={() => setIsOpen(false)}>
              <span role="img" aria-label="football">
                🏈
              </span>{' '}
              Football
            </MenuItem>
          </Link>

          <Link to="/baseball" style={{ textDecoration: 'none' }}>
            <MenuItem onPress={() => setIsOpen(false)}>
              <span role="img" aria-label="baseball">
                ⚾
              </span>{' '}
              Baseball
            </MenuItem>
          </Link>
        </DropdownContent>
      )}
    </YStack>
  );
};
