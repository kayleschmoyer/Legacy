import React, { useState } from 'react';
import { Tabs, Text, XStack, YStack } from 'tamagui';
import { BarChart2, Zap } from '@tamagui/lucide-icons';
import { PlayerStatsDataGrid } from './PlayerStatsDataGrid';
import { PitchingStatsDataGrid } from './PitchingStatsDataGrid';
import type {
  PlayerStatsFilters,
  PlayerStatsViewMode,
  PlayerWithStats,
} from './PlayerStatsTypes';
import type { PlayerCareerStats } from './services/CareerStatsService';
import { Platform } from '../../platform-components';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  SURFACE_CARD,
  SURFACE_SUBTLE,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../utils/colors';
import type { CareerPitchingFragment } from '../../api/db/graphql.generated';

// ─── .impeccable.md editorial typography (web-only font stack) ───────────────
const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";
const FONT_BODY = "'Literata', serif";

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
 * UI Refresh (LS-3120): editorial typography, flat surfaces, crossfade
 * tab transitions, brand-compliant gold usage.
 */
export function PlayerStatsPage({
  title = 'Player Statistics',
  initialViewMode: _initialViewMode = 'combined',
  initialFilters: _initialFilters = {},
  initialPageSize = 25,
  showHeader = true,
  showActions: _showActions = true,
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
    <YStack flex={1} style={{ backgroundColor: BG_DARK }}>
      {/* ── CSS: crossfade tab transitions + reduced-motion guard (web only) ── */}
      {Platform.OS === 'web' && (
        <style>{`
          @keyframes playerStats-fadeIn {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @media (prefers-reduced-motion: no-preference) {
            .playerStats-tabContent {
              animation: playerStats-fadeIn 0.2s ease forwards;
            }
          }
        `}</style>
      )}

      {/* ── Header ─────────────────────────────────────────────────── */}
      {showHeader && (
        <YStack
          style={{
            background: `linear-gradient(160deg, ${BRAND_NAVY_DARK} 0%, ${BRAND_NAVY} 100%)`,
            borderBottom: `1px solid ${withAlpha(BRAND_GOLD, 0.2)}`,
            boxShadow: `0 2px 16px rgba(0,0,0,0.45)`,
          }}
          paddingVertical="$6"
          paddingHorizontal="$8"
        >
          <XStack
            alignItems="center"
            justifyContent="space-between"
            gap="$4"
            flexWrap="wrap"
          >
            {/* Title block */}
            <YStack gap="$1">
              <Text
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 36,
                  fontWeight: '800',
                  letterSpacing: 0.5,
                  color: TEXT_PRIMARY,
                  lineHeight: 1.1,
                  textTransform: 'uppercase',
                }}
              >
                {title}
              </Text>
              <Text
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 13,
                  color: TEXT_MUTED,
                  letterSpacing: 0.2,
                }}
              >
                MLB Career Leaders · Batting &amp; Pitching
              </Text>
            </YStack>

            {/* All-Time Records label */}
            <YStack
              paddingHorizontal="$3"
              paddingVertical="$1"
              style={{
                backgroundColor: SURFACE_CARD,
                border: `1px solid ${withAlpha(BRAND_GOLD, 0.25)}`,
                borderRadius: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  color: BRAND_GOLD,
                }}
              >
                All-Time Records
              </Text>
            </YStack>
          </XStack>
        </YStack>
      )}

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <YStack flex={1} padding="$4" gap="$4">
        {/* ── Tab Switcher ──────────────────────────────────────────── */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          orientation="horizontal"
          flexDirection="column"
          flex={1}
        >
          <Tabs.List
            style={{
              backgroundColor: SURFACE_SUBTLE,
              border: `1px solid ${withAlpha(BRAND_NAVY, 0.35)}`,
              borderRadius: 10,
              padding: 4,
            }}
          >
            {/* Batting Tab */}
            <Tabs.Tab
              value="batting"
              data-testid="tab-trigger-batting"
              style={{
                backgroundColor:
                  activeTab === 'batting' ? BRAND_NAVY : 'transparent',
                borderRadius: 6,
                cursor: 'pointer',
                // Web: CSS border shorthand + transition
                ...(Platform.OS === 'web' && {
                  borderBottom:
                    activeTab === 'batting'
                      ? `2px solid ${BRAND_GOLD}`
                      : '2px solid transparent',
                  transition:
                    'background-color 0.15s ease, border-color 0.15s ease',
                }),
                // Native: RN-compatible border longhand
                ...(Platform.OS !== 'web' && {
                  borderBottomWidth: 2,
                  borderBottomColor:
                    activeTab === 'batting' ? BRAND_GOLD : 'transparent',
                }),
              }}
              paddingVertical="$2"
              paddingHorizontal="$4"
            >
              <XStack alignItems="center" gap="$2" justifyContent="center">
                <BarChart2
                  size={16}
                  color={activeTab === 'batting' ? BRAND_GOLD : TEXT_MUTED}
                />
                <Text
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 15,
                    fontWeight: activeTab === 'batting' ? '700' : '600',
                    letterSpacing: 0.4,
                    color: activeTab === 'batting' ? TEXT_PRIMARY : TEXT_MUTED,
                    ...(Platform.OS === 'web' && {
                      transition: 'color 0.15s ease',
                    }),
                  }}
                >
                  Batting Stats
                </Text>
              </XStack>
            </Tabs.Tab>

            {/* Pitching Tab */}
            <Tabs.Tab
              value="pitching"
              data-testid="tab-trigger-pitching"
              style={{
                backgroundColor:
                  activeTab === 'pitching' ? BRAND_NAVY : 'transparent',
                borderRadius: 6,
                cursor: 'pointer',
                // Web: CSS border shorthand + transition
                ...(Platform.OS === 'web' && {
                  borderBottom:
                    activeTab === 'pitching'
                      ? `2px solid ${BRAND_GOLD}`
                      : '2px solid transparent',
                  transition:
                    'background-color 0.15s ease, border-color 0.15s ease',
                }),
                // Native: RN-compatible border longhand
                ...(Platform.OS !== 'web' && {
                  borderBottomWidth: 2,
                  borderBottomColor:
                    activeTab === 'pitching' ? BRAND_GOLD : 'transparent',
                }),
              }}
              paddingVertical="$2"
              paddingHorizontal="$4"
            >
              <XStack alignItems="center" gap="$2" justifyContent="center">
                <Zap
                  size={16}
                  color={activeTab === 'pitching' ? BRAND_GOLD : TEXT_MUTED}
                />
                <Text
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 15,
                    fontWeight: activeTab === 'pitching' ? '700' : '600',
                    letterSpacing: 0.4,
                    color: activeTab === 'pitching' ? TEXT_PRIMARY : TEXT_MUTED,
                    ...(Platform.OS === 'web' && {
                      transition: 'color 0.15s ease',
                    }),
                  }}
                >
                  Pitching Stats
                </Text>
              </XStack>
            </Tabs.Tab>
          </Tabs.List>

          {/* ── Batting Tab Content ──────────────────────────── */}
          <Tabs.Content value="batting" flex={1}>
            <YStack
              flex={1}
              paddingTop="$4"
              {...(Platform.OS === 'web' && {
                className: 'playerStats-tabContent',
              })}
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

          {/* ── Pitching Tab Content ─────────────────────────── */}
          <Tabs.Content value="pitching" flex={1}>
            <YStack
              flex={1}
              paddingTop="$4"
              {...(Platform.OS === 'web' && {
                className: 'playerStats-tabContent',
              })}
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
