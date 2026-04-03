import React, { useState } from 'react';
import { Tabs, Text, XStack, YStack } from 'tamagui';
import { PlayerStatsDataGrid } from './PlayerStatsDataGrid';
import { PitchingStatsDataGrid } from './PitchingStatsDataGrid';
import type {
  PlayerStatsFilters,
  PlayerStatsViewMode,
  PlayerWithStats,
} from './PlayerStatsTypes';
import type { PlayerCareerStats } from './services/CareerStatsService';
import type { CareerPitchingFragment } from '../../api/db/graphql.generated';

// ─── Brand color constants (mirror apps/web/src/constants/colors.ts) ──────────
const BRAND_NAVY = '#1B3A5C';
const BRAND_NAVY_LIGHT = '#2C4A7C';
const BRAND_NAVY_DARK = '#143050';
const BRAND_GOLD = '#C5A55A';
const BRAND_GOLD_LIGHT = '#D4BB78';
const BG_DARK = '#0A0F1A';
const SURFACE_PANEL = '#111B2F';
const TEXT_HIGH_CONTRAST = '#F5F7FA';
const TEXT_MUTED = '#9CAAC5';

export interface PlayerStatsPageProps {
  title?: string;
  initialViewMode?: PlayerStatsViewMode;
  initialFilters?: Partial<PlayerStatsFilters>;
  initialPageSize?: number;
  showHeader?: boolean;
  showActions?: boolean;
  /** Stats display format: 'standard' shows high-priority columns only, 'expanded' shows all */
  statsFormat?: 'standard' | 'expanded';
  onPlayerDetails?: (player: PlayerWithStats) => void;
  onExport?: (
    filters: PlayerStatsFilters,
    viewMode: PlayerStatsViewMode,
  ) => void;
  onShare?: (url: string) => void;
}

/**
 * Player Statistics Page Component
 *
 * A comprehensive page for displaying and filtering player statistics.
 * Fully implemented with actual career statistics data from GraphQL API.
 * Features tabs for Batting and Pitching statistics.
 *
 * UI Refresh (LS-239): glassmorphism hero header, gradient backgrounds,
 * brand gold/navy tab switcher, and subtle entrance animations.
 */
export function PlayerStatsPage({
  title = 'Player Statistics',
  initialViewMode: _initialViewMode = 'combined',
  initialFilters: _initialFilters = {},
  initialPageSize = 25,
  showHeader = true,
  showActions = true,
  statsFormat = 'expanded',
  onPlayerDetails,
  onExport: _onExport,
  onShare: _onShare,
}: PlayerStatsPageProps) {
  const [activeTab, setActiveTab] = useState<string>('batting');

  // Handle batting player click
  const handleBattingPlayerClick = (player: PlayerCareerStats) => {
    if (onPlayerDetails) {
      const playerWithStats: PlayerWithStats = {
        id: player.playerId,
        name: player.displayName || `Player ${player.playerId}`,
      } as PlayerWithStats;
      onPlayerDetails(playerWithStats);
    }
  };

  // Handle pitching player click
  const handlePitchingPlayerClick = (player: CareerPitchingFragment) => {
    if (onPlayerDetails) {
      const firstName = player.player?.firstName;
      const lastName = player.player?.lastName;
      const playerWithStats: PlayerWithStats = {
        id: player.playerId || 0,
        name:
          firstName && lastName
            ? `${firstName} ${lastName}`
            : `Player ${player.playerId}`,
      } as PlayerWithStats;
      onPlayerDetails(playerWithStats);
    }
  };

  return (
    <YStack
      flex={1}
      style={{
        background: `linear-gradient(160deg, ${BG_DARK} 0%, ${SURFACE_PANEL} 60%, ${BRAND_NAVY_DARK} 100%)`,
        minHeight: '100vh',
      }}
    >
      {/* ── CSS Keyframes ───────────────────────────────────────── */}
      {/* Use text children instead of dangerouslySetInnerHTML — React renders
          style tag children as textContent (safe), not as innerHTML. */}
      <style>{`
        @keyframes playerStats-fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes playerStats-glowPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(196,165,90,0.3); }
          50%       { box-shadow: 0 0 16px rgba(196,165,90,0.6); }
        }
      `}</style>

      {/* ── Glassmorphic Hero Header ────────────────────────────── */}
      {showHeader && (
        <YStack
          style={{
            background: `linear-gradient(135deg, ${BRAND_NAVY_DARK} 0%, ${BRAND_NAVY} 55%, ${BRAND_NAVY_LIGHT} 100%)`,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderBottom: `1px solid rgba(196,165,90,0.25)`,
            boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 1px 0 rgba(196,165,90,0.1)`,
          }}
          paddingVertical="$7"
          paddingHorizontal="$8"
        >
          <XStack
            alignItems="center"
            justifyContent="space-between"
            gap="$4"
            flexWrap="wrap"
          >
            {/* Icon + Title */}
            <XStack alignItems="center" gap="$3" flexShrink={0}>
              <YStack
                style={{
                  background: `radial-gradient(circle, rgba(196,165,90,0.2) 0%, transparent 70%)`,
                  borderRadius: '50%',
                  padding: 8,
                }}
              >
                <Text
                  fontSize={34}
                  style={{
                    filter: 'drop-shadow(0 0 8px rgba(196,165,90,0.55))',
                    lineHeight: 1,
                  }}
                >
                  <span role="img" aria-label="Baseball">
                    ⚾
                  </span>
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text
                  fontSize="$8"
                  fontWeight="800"
                  letterSpacing={-0.5}
                  style={{
                    background: `linear-gradient(90deg, ${TEXT_HIGH_CONTRAST} 0%, ${BRAND_GOLD_LIGHT} 100%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    lineHeight: 1.3,
                    paddingTop: 10,
                    paddingBottom: 12,
                    display: 'inline-block',
                  }}
                >
                  {title}
                </Text>
                <Text
                  fontSize="$3"
                  letterSpacing={0.3}
                  style={{ color: TEXT_MUTED }}
                >
                  MLB Career Leaders · Batting &amp; Pitching
                </Text>
              </YStack>
            </XStack>

            {/* Decorative divider */}
            <YStack
              flex={1}
              height={1}
              maxWidth={120}
              style={{
                background: `linear-gradient(90deg, transparent, rgba(196,165,90,0.4), transparent)`,
              }}
            />

            {/* "All-Time Records" badge */}
            <YStack
              paddingHorizontal="$4"
              paddingVertical="$2"
              style={{
                background: `rgba(196,165,90,0.1)`,
                border: `1px solid rgba(196,165,90,0.3)`,
                borderRadius: 99,
                animation: 'playerStats-glowPulse 3s ease-in-out infinite',
              }}
            >
              <Text
                fontSize="$2"
                fontWeight="700"
                letterSpacing={1.2}
                textTransform="uppercase"
                style={{ color: BRAND_GOLD_LIGHT }}
              >
                All-Time Records
              </Text>
            </YStack>
          </XStack>
        </YStack>
      )}

      {/* ── Main Content ─────────────────────────────────────────── */}
      <YStack flex={1} padding="$4" gap="$4">
        {/* Info Banner */}
        {showActions && (
          <XStack
            style={{
              background: `rgba(44,74,124,0.15)`,
              border: `1px solid rgba(44,74,124,0.35)`,
              borderRadius: 12,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
            paddingHorizontal="$4"
            paddingVertical="$3"
            alignItems="center"
            gap="$2"
          >
            <Text fontSize="$4" style={{ color: BRAND_GOLD_LIGHT }}>
              ℹ
            </Text>
            <Text fontSize="$3" style={{ color: TEXT_MUTED }}>
              Browse comprehensive batting and pitching career statistics. Click
              column headers to sort. Click a row to view player details.
            </Text>
          </XStack>
        )}

        {/* ── Tab Switcher ────────────────────────────────────────── */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          orientation="horizontal"
          flexDirection="column"
          flex={1}
        >
          <Tabs.List
            style={{
              background: `rgba(10,15,26,0.75)`,
              border: `1px solid rgba(44,74,124,0.45)`,
              borderRadius: 14,
              padding: 4,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            {/* Batting Tab */}
            <Tabs.Tab
              value="batting"
              data-testid="tab-trigger-batting"
              style={{
                background:
                  activeTab === 'batting'
                    ? `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`
                    : 'transparent',
                border:
                  activeTab === 'batting'
                    ? `1px solid rgba(196,165,90,0.4)`
                    : '1px solid transparent',
                borderRadius: 10,
                boxShadow:
                  activeTab === 'batting'
                    ? `0 2px 12px rgba(20,48,80,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`
                    : 'none',
                transition: 'all 0.22s ease',
                cursor: 'pointer',
              }}
              paddingVertical="$2"
              paddingHorizontal="$3"
            >
              <XStack alignItems="center" gap="$2" justifyContent="center">
                <Text
                  fontSize={18}
                  style={{
                    filter:
                      activeTab === 'batting'
                        ? 'drop-shadow(0 0 4px rgba(196,165,90,0.5))'
                        : 'none',
                    transition: 'filter 0.22s ease',
                  }}
                >
                  <span role="img" aria-label="Baseball">
                    ⚾
                  </span>
                </Text>
                <Text
                  fontSize="$4"
                  fontWeight={activeTab === 'batting' ? '700' : '500'}
                  style={{
                    color:
                      activeTab === 'batting' ? BRAND_GOLD_LIGHT : TEXT_MUTED,
                    transition: 'color 0.22s ease',
                  }}
                >
                  Batting Stats
                </Text>
                {activeTab === 'batting' && (
                  <YStack
                    width={6}
                    height={6}
                    borderRadius={3}
                    style={{ background: BRAND_GOLD }}
                  />
                )}
              </XStack>
            </Tabs.Tab>

            {/* Pitching Tab */}
            <Tabs.Tab
              value="pitching"
              data-testid="tab-trigger-pitching"
              style={{
                background:
                  activeTab === 'pitching'
                    ? `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`
                    : 'transparent',
                border:
                  activeTab === 'pitching'
                    ? `1px solid rgba(196,165,90,0.4)`
                    : '1px solid transparent',
                borderRadius: 10,
                boxShadow:
                  activeTab === 'pitching'
                    ? `0 2px 12px rgba(20,48,80,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`
                    : 'none',
                transition: 'all 0.22s ease',
                cursor: 'pointer',
              }}
              paddingVertical="$2"
              paddingHorizontal="$3"
            >
              <XStack alignItems="center" gap="$2" justifyContent="center">
                <Text
                  fontSize={18}
                  style={{
                    filter:
                      activeTab === 'pitching'
                        ? 'drop-shadow(0 0 4px rgba(196,165,90,0.5))'
                        : 'none',
                    transition: 'filter 0.22s ease',
                  }}
                >
                  <span role="img" aria-label="Pitching target">
                    🎯
                  </span>
                </Text>
                <Text
                  fontSize="$4"
                  fontWeight={activeTab === 'pitching' ? '700' : '500'}
                  style={{
                    color:
                      activeTab === 'pitching' ? BRAND_GOLD_LIGHT : TEXT_MUTED,
                    transition: 'color 0.22s ease',
                  }}
                >
                  Pitching Stats
                </Text>
                {activeTab === 'pitching' && (
                  <YStack
                    width={6}
                    height={6}
                    borderRadius={3}
                    style={{ background: BRAND_GOLD }}
                  />
                )}
              </XStack>
            </Tabs.Tab>
          </Tabs.List>

          {/* ── Batting Tab Content ─────────────────────────── */}
          <Tabs.Content value="batting" flex={1}>
            <YStack
              flex={1}
              paddingTop="$4"
              style={{
                animation: 'playerStats-fadeSlideIn 0.25s ease forwards',
              }}
            >
              <PlayerStatsDataGrid
                title="MLB Career Batting Leaders"
                initialParams={{
                  first: initialPageSize,
                  orderBy: 'homeRuns',
                  orderDirection: 'desc',
                  minGames: 0,
                }}
                onPlayerSelect={handleBattingPlayerClick}
                showSearch={true}
                showFilters={true}
                showSorting={true}
                showPagination={true}
                statsFormat={statsFormat}
              />
            </YStack>
          </Tabs.Content>

          {/* ── Pitching Tab Content ────────────────────────── */}
          <Tabs.Content value="pitching" flex={1}>
            <YStack
              flex={1}
              paddingTop="$4"
              style={{
                animation: 'playerStats-fadeSlideIn 0.25s ease forwards',
              }}
            >
              <PitchingStatsDataGrid
                title="MLB Career Pitching Leaders"
                initialParams={{
                  limit: initialPageSize,
                  offset: 0,
                  orderBy: 'wins',
                  orderDirection: 'desc',
                  minGames: 0,
                }}
                onPlayerSelect={handlePitchingPlayerClick}
                showSearch={true}
                showFilters={true}
                showSorting={true}
                showPagination={true}
                statsFormat={statsFormat}
              />
            </YStack>
          </Tabs.Content>
        </Tabs>
      </YStack>
    </YStack>
  );
}
