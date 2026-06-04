import React, { useCallback } from 'react';
import { Linking } from 'react-native';
import { Button, Card, Separator, Text, XStack, YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';
import { PremiumGate } from '../subscription/PremiumGate';
import { useSubscription } from '../subscription/useSubscription';

const APP_BASE_URL_FALLBACK = 'https://legacysports.app';

export interface SalaryCapManagementCardProps {
  /** Numeric league id used to build the web management deep link. */
  leagueId: number;
  /** Sport segment of the web route (`/baseball/league/...` vs `/football/league/...`). */
  sport: 'baseball' | 'football';
  /** Whether this league has a salary cap enabled. Card renders nothing when false. */
  salaryCapEnabled: boolean;
  /** Configured salary cap limit (whole dollars), shown for context when present. */
  salaryCap?: number | null;
}

/**
 * SalaryCapManagementCard — commissioner entry point for salary cap management
 * on mobile (LS-5207).
 *
 * Mobile has no native salary cap management screen, so premium commissioners in
 * cap leagues had no way to view team salaries, enforce the cap, or approve
 * cap-impacting trades from the app. This card surfaces a deep link to the full
 * web management experience (`/{sport}/league/{leagueId}` → Commish tab), gated
 * to premium users via {@link PremiumGate} for parity with the web salary cap
 * controls. Non-cap leagues render nothing.
 *
 * Building a full native management view is deliberately out of scope here
 * (tracked separately); the web deep link is the parity fix the ticket calls for.
 */
export function SalaryCapManagementCard({
  leagueId,
  sport,
  salaryCapEnabled,
  salaryCap,
}: SalaryCapManagementCardProps): React.JSX.Element | null {
  const { isPremium } = useSubscription();

  const handleOpenWeb = useCallback(() => {
    const baseUrl = config.appBaseUrl ?? APP_BASE_URL_FALLBACK;
    const url = `${baseUrl}/${sport}/league/${leagueId}`;
    void Linking.openURL(url).catch((error: unknown) => {
      LOGGER.error(
        'Failed to open web salary cap management link',
        error instanceof Error ? error : new Error(String(error)),
      );
    });
  }, [sport, leagueId]);

  // Only cap-enabled leagues have salary cap to manage.
  if (!salaryCapEnabled) {
    return null;
  }

  return (
    <PremiumGate
      isPremium={isPremium}
      featureName="Salary Cap"
      featureDescription="Manage team salaries and enforce roster spending caps from the full web experience."
    >
      <Card backgroundColor="$blue2" borderColor="$blue6" padding="$4">
        <YStack space="$3">
          <Text fontSize="$5" fontWeight="600" color="$blue11">
            Salary Cap Management
          </Text>
          <Text color="$gray11" fontSize="$3">
            View team salaries, track cap space, and approve cap-impacting
            trades from the full salary cap management tools on the web.
          </Text>
          {salaryCap != null && (
            <Text fontSize="$3" color="$gray10">
              Cap limit: ${salaryCap.toLocaleString()}
            </Text>
          )}
          <Separator />
          <XStack justifyContent="space-between" alignItems="center">
            <YStack flex={1}>
              <Text fontSize="$4" fontWeight="500">
                Manage on Web
              </Text>
              <Text fontSize="$2" color="$gray10">
                Opens league salary cap management in your browser
              </Text>
            </YStack>
            <Button
              backgroundColor="$blue9"
              color="white"
              onPress={handleOpenWeb}
              minWidth={120}
            >
              Open
            </Button>
          </XStack>
        </YStack>
      </Card>
    </PremiumGate>
  );
}
