import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Button,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { Text } from '@legacy-sports/ui-abstractions';
import { styled } from 'tamagui';
import { ChevronDown, ChevronUp, Trophy } from '@tamagui/lucide-icons';
import { useGetUserLeaguesQuery } from '../../api/db/graphql.generated';

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
  padding: '$2',
  gap: '$1',
  minWidth: 220,
  maxWidth: 320,
  maxHeight: 360,
  shadowColor: '$shadowColor',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.2,
  shadowRadius: 24,
  elevation: 12,
  overflow: 'hidden',
  overflowY: 'auto',
  zIndex: 100,
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

export const MyLeaguesDropdown: React.FC = () => {
  const auth = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonId = 'my-leagues-menu-button';
  const menuId = 'my-leagues-menu';

  const isLoggedIn = Boolean(auth?.user);

  const { data, loading } = useGetUserLeaguesQuery({
    skip: !isLoggedIn,
  });

  const leagues = data?.userLeagues ?? [];
  const isActive = location.pathname.startsWith('/baseball/league/');
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
      const btn = document.getElementById(buttonId);
      btn?.focus();
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
      let nextIndex: number;
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      }
      items[nextIndex]?.focus();
    }
  };

  // Don't render if user is not logged in
  if (!isLoggedIn) return null;

  return (
    <YStack
      position="relative"
      flexShrink={0}
      ref={dropdownRef}
      onKeyDown={onKeyDown}
    >
      <DropdownButton
        highlight={isHighlighted}
        onPress={() => setIsOpen((o) => !o)}
        id={buttonId}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
      >
        <Trophy size={15} />
        <Text>My Leagues</Text>
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
          role="menu"
          id={menuId}
          aria-labelledby={buttonId}
        >
          {loading && (
            <XStack justifyContent="center" alignItems="center" padding="$4">
              <Paragraph marginBottom={0} fontSize={13} color="$color10">
                Loading…
              </Paragraph>
            </XStack>
          )}

          {!loading && leagues.length === 0 && (
            <YStack padding="$3" gap="$2">
              <Paragraph
                fontSize={13}
                color="$color10"
                textAlign="center"
                marginBottom={0}
              >
                You are not in any leagues yet.
              </Paragraph>
              <Link
                to="/baseball"
                style={{ textDecoration: 'none', display: 'block' }}
                onClick={() => setIsOpen(false)}
              >
                <MenuItem role="menuitem">
                  <Paragraph marginBottom={0} fontSize={14}>
                    Browse Leagues
                  </Paragraph>
                </MenuItem>
              </Link>
              <Link
                to="/baseball/league/create"
                style={{ textDecoration: 'none', display: 'block' }}
                onClick={() => setIsOpen(false)}
              >
                <MenuItem role="menuitem">
                  <Paragraph marginBottom={0} fontSize={14}>
                    Create a League
                  </Paragraph>
                </MenuItem>
              </Link>
            </YStack>
          )}

          {!loading &&
            leagues.map((league) => {
              if (!league.id) return null;
              const href = `/baseball/league/${league.id}`;
              const isLeagueActive = location.pathname.startsWith(href);
              return (
                <Link
                  key={league.id}
                  to={href}
                  style={{ textDecoration: 'none', display: 'block' }}
                  onClick={() => setIsOpen(false)}
                >
                  <MenuItem
                    role="menuitem"
                    active={isLeagueActive}
                    aria-current={isLeagueActive ? 'page' : undefined}
                  >
                    <XStack
                      alignItems="center"
                      gap="$2"
                      flex={1}
                      overflow="hidden"
                    >
                      <Paragraph
                        marginBottom={0}
                        fontSize={14}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {league.name ?? `League ${league.id}`}
                      </Paragraph>
                      {league.draftStatus === 'in-progress' && (
                        <Paragraph
                          marginBottom={0}
                          fontSize={11}
                          color="$green10"
                          fontWeight="600"
                        >
                          LIVE
                        </Paragraph>
                      )}
                    </XStack>
                  </MenuItem>
                </Link>
              );
            })}
        </DropdownContent>
      )}
    </YStack>
  );
};
