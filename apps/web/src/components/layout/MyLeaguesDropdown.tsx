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
import {
  NAV_BUTTON_MIN_WIDTH,
  NAV_DROPDOWN_Z_INDEX,
} from '../../constants/dimensions';
import { BaseballIcon, FootballIcon } from '../icons/SportIcons';

const DropdownButton = styled(Button, {
  size: '$3',
  gap: '$2',
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderRadius: '$2',
  paddingHorizontal: '$4',
  minWidth: NAV_BUTTON_MIN_WIDTH,
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
  minWidth: 240,
  maxWidth: 320,
  maxHeight: 360,
  shadowColor: '$shadowColor',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.2,
  shadowRadius: 24,
  elevation: 12,
  overflow: 'hidden',
  overflowY: 'auto',
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

/**
 * Returns "Baseball", "Football", or null based on playerPool value.
 * Baseball playerPool values are "all", "al", "nl" (MLB pool filters).
 */
function getSportLabel(playerPool: string | null | undefined): string | null {
  if (!playerPool) return null;
  const pool = playerPool.toLowerCase();
  // Baseball pools: "all" (all of MLB), "al" (American League), "nl" (National League)
  if (
    pool === 'all' ||
    pool === 'al' ||
    pool === 'nl' ||
    pool.includes('baseball') ||
    pool === 'mlb'
  )
    return 'Baseball';
  if (pool.includes('football') || pool === 'nfl') return 'Football';
  return null;
}

/** Returns a secondary context string like "Week 3", "Active", or "Pre-Draft". */
function getLeagueContext(
  leaguePhase: string | null | undefined,
  currentWeekNumber: number | null | undefined,
): string {
  if (!leaguePhase) return '';
  if (leaguePhase === 'pre-draft') return 'Pre-Draft';
  if (leaguePhase === 'active') {
    return currentWeekNumber ? `Week ${currentWeekNumber}` : 'Active';
  }
  if (leaguePhase === 'offseason') return 'Offseason';
  return leaguePhase;
}

interface SportIconInBoxProps {
  playerPool: string | null | undefined;
}

function SportIconInBox({ playerPool }: SportIconInBoxProps) {
  const pool = (playerPool ?? '').toLowerCase();
  if (pool.includes('football') || pool === 'nfl') {
    return <FootballIcon size={20} color="var(--color)" />;
  }
  // Default to baseball (primary sport)
  return <BaseballIcon size={20} color="var(--color)" />;
}

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
          zIndex={NAV_DROPDOWN_Z_INDEX}
          role="menu"
          id={menuId}
          aria-labelledby={buttonId}
          style={{
            animation:
              'navDropdownIn 150ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
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
              const sportLabel = getSportLabel(league.playerPool);
              const phaseContext = getLeagueContext(
                league.leaguePhase,
                league.currentWeekNumber,
              );
              const secondaryLine = [sportLabel, phaseContext]
                .filter(Boolean)
                .join(' · ');

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
                      gap="$3"
                      flex={1}
                      overflow="hidden"
                    >
                      <MenuIconBox>
                        <SportIconInBox playerPool={league.playerPool} />
                      </MenuIconBox>
                      <YStack flex={1} gap="$1" overflow="hidden">
                        <XStack alignItems="center" gap="$2">
                          <Paragraph
                            marginBottom={0}
                            size="$4"
                            color="$color"
                            fontWeight="500"
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
                        {secondaryLine ? (
                          <Paragraph
                            marginBottom={0}
                            size="$2"
                            color="$colorPress"
                          >
                            {secondaryLine}
                          </Paragraph>
                        ) : null}
                      </YStack>
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
