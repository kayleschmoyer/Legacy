import React, { useState } from 'react';
import { Button, ScrollView, XStack } from 'tamagui';
import { ExternalLink } from '@tamagui/lucide-icons/icons/ExternalLink';
import { X } from '@tamagui/lucide-icons/icons/X';
import { FootballPlayerDetail } from '@legacy-sports/shared-components/football';
import { config } from '@legacy-sports/app-config/web';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { useFootballPlayerQuery } from '@legacy-sports/graphql';
import { BaseModal } from './BaseModal';
import { UpgradeModal } from './UpgradeModal';
import { useHasEntitlement } from '../hooks/useIsPremium';
import {
  BG_DARK,
  OUTLINE_SUBTLE,
  STATS_BORDER,
  TEXT_INTERFACE,
  TEXT_MUTED,
  WHITE,
  withAlpha,
} from '../constants/colors';

const FOOTBALL_GAME_LOGS_ENDPOINT = config.statsApiUrl
  ? `${config.statsApiUrl.replace(/\/+$/, '')}/nfl-game-logs`
  : undefined;

const PROJECTIONS_FEATURE_NAME = 'Projections';
const PROJECTIONS_FEATURE_DESCRIPTION =
  'Unlock weekly projections, matchup ratings, and strength-of-schedule for every player with Premium.';

export interface FootballPlayerDetailModalProps {
  /** Numeric player ID to load; the modal is skipped when null. */
  playerId: number | null;
  /** Whether the modal is visible. */
  open: boolean;
  /** Called when the modal should close. */
  onOpenChange: (open: boolean) => void;
  /**
   * Optional "open full page" affordance. When provided, a button navigates to
   * the standalone `/football/players/:id` route (mirrors PlayerDetailModal).
   */
  onViewFullPage?: () => void;
}

/**
 * FootballPlayerDetailModal — routable NFL player detail dialog rendered in
 * place over the unified stats list when `?playerId=X` is present (LS-8442).
 *
 * Mirrors {@link PlayerDetailModal} (MLB): a {@link BaseModal} wrapping the
 * shared {@link FootballPlayerDetail}, driven by the `FootballPlayer` query.
 * The whole surface renders for all viewers — projections are the premium
 * teaser (via {@link UpgradeModal}) — matching FootballPlayerDetailPage rather
 * than gating the entire modal like the MLB path.
 */
export function FootballPlayerDetailModal({
  playerId,
  open,
  onOpenChange,
  onViewFullPage,
}: FootballPlayerDetailModalProps) {
  const isPremium = useHasEntitlement(ENTITLEMENTS.football_projections);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const { data, loading, error } = useFootballPlayerQuery({
    variables: { id: playerId ?? 0 },
    skip: !playerId || !open,
  });

  const player = data?.footballPlayer;
  const notFound = !!playerId && !loading && !error && !player;
  const resolvedName =
    [player?.firstName, player?.lastName].filter(Boolean).join(' ') ||
    'Player details';

  return (
    <>
      <BaseModal
        open={open}
        onOpenChange={onOpenChange}
        title={resolvedName}
        maxWidth={1200}
        hideHeader
      >
        <ScrollView
          maxHeight="min(88dvh, calc(100dvh - 32px))"
          backgroundColor={BG_DARK}
        >
          <XStack
            paddingHorizontal={16}
            paddingTop={12}
            justifyContent="flex-end"
            alignItems="center"
            gap={8}
          >
            {onViewFullPage && (
              <Button
                size="$3"
                icon={<ExternalLink size={14} color={TEXT_MUTED} />}
                aria-label="Open full page"
                onPress={onViewFullPage}
                backgroundColor="transparent"
                borderColor={OUTLINE_SUBTLE}
                borderWidth={1}
                color={TEXT_MUTED}
                fontSize={12}
                hoverStyle={{ backgroundColor: withAlpha(TEXT_MUTED, 0.1) }}
                pressStyle={{ opacity: 0.8 }}
              >
                Full page
              </Button>
            )}
            <Button
              size="$3"
              circular
              icon={X}
              aria-label="Close"
              onPress={() => onOpenChange(false)}
              backgroundColor={withAlpha(WHITE, 0.08)}
              borderColor={STATS_BORDER}
              borderWidth={1}
              color={TEXT_INTERFACE}
              hoverStyle={{ backgroundColor: withAlpha(WHITE, 0.14) }}
              pressStyle={{ backgroundColor: withAlpha(WHITE, 0.18) }}
            />
          </XStack>
          <FootballPlayerDetail
            player={player}
            loading={loading}
            error={!!error}
            notFound={notFound}
            isPremium={isPremium}
            onUpgrade={() => setShowUpgradeModal(true)}
            initialTab="overview"
            gameLogsApiEndpoint={FOOTBALL_GAME_LOGS_ENDPOINT}
          />
        </ScrollView>
      </BaseModal>
      {!isPremium && (
        <UpgradeModal
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          featureName={PROJECTIONS_FEATURE_NAME}
          featureDescription={PROJECTIONS_FEATURE_DESCRIPTION}
        />
      )}
    </>
  );
}

export default FootballPlayerDetailModal;
