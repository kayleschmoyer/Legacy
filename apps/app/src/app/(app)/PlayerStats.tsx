import React, { useCallback } from 'react';
import { Share } from 'react-native';
import { useRouter } from 'expo-router';
import {
  type PlayerStatsFilters,
  PlayerStatsPage,
  type PlayerStatsViewMode,
  type PlayerWithStats,
} from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';
import { PremiumGate } from '../../features/subscription/PremiumGate';
import { useSubscription } from '../../features/subscription/useSubscription';

// Web origin used to turn the shared component's relative share path into a
// fully-qualified deep link (matches the SalaryCapManagementCard pattern).
const APP_BASE_URL = config.appBaseUrl ?? 'https://legacysports.app';

/**
 * Mobile Player Statistics Screen
 *
 * Wraps the shared {@link PlayerStatsPage} with mobile navigation and
 * native-appropriate export/share. Tapping a player navigates to the
 * PlayerDetail screen via Expo Router; the shared component owns the filter,
 * sort, and premium-column UI so native stays at parity with web (LS-7806).
 */
export default function PlayerStatsScreen() {
  const router = useRouter();
  const { isPremium } = useSubscription();

  const handlePlayerDetails = useCallback(
    (player: PlayerWithStats) => {
      router.push({
        pathname: '/PlayerDetail',
        params: { playerId: String(player.id), playerName: player.name },
      });
    },
    [router],
  );

  // Share the current view as a deep link via the native share sheet so a
  // teammate can open the same filtered stats on the web app.
  const handleShare = useCallback(async (url: string) => {
    const fullUrl = `${APP_BASE_URL}${url}`;
    try {
      const result = await Share.share({
        message: `Player stats on Legacy Sports\n\n${fullUrl}`,
        title: 'Player Statistics',
        url: fullUrl,
      });
      if (result.action === Share.dismissedAction) {
        // User dismissed the sheet without sharing. Nothing downstream depends
        // on success, but log it so completed shares and cancellations are
        // distinguishable (matches BaseballHome.shareLeagueInvite).
        LOGGER.debug('Player stats share dismissed by user');
      }
    } catch (error: unknown) {
      LOGGER.error(
        'Error while sharing player statistics link',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }, []);

  // Export the active filter snapshot as JSON through the share sheet (native
  // has no file-download affordance; the share sheet routes to Files/clipboard/
  // messaging per the user's choice).
  const handleExport = useCallback(
    async (filters: PlayerStatsFilters, viewMode: PlayerStatsViewMode) => {
      const payload = JSON.stringify({ viewMode, filters }, null, 2);
      try {
        const result = await Share.share({
          message: payload,
          title: 'Player Statistics Export',
        });
        if (result.action === Share.dismissedAction) {
          LOGGER.debug('Player stats export dismissed by user');
        }
      } catch (error: unknown) {
        LOGGER.error(
          'Error while exporting player statistics',
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
    [],
  );

  return (
    <PremiumGate isPremium={isPremium} featureName="Player Statistics">
      <PlayerStatsPage
        onPlayerDetails={handlePlayerDetails}
        onShare={(url) => void handleShare(url)}
        onExport={(filters, viewMode) => void handleExport(filters, viewMode)}
        showHeader={true}
        showActions={true}
        statsFormat="expanded"
      />
    </PremiumGate>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
