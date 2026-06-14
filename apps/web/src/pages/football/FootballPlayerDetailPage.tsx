import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { YStack } from 'tamagui';
import { CombinedGraphQLErrors } from '@apollo/client';
import {
  FOOTBALL_PLAYER_DETAIL_POLL_MS,
  FootballPlayerDetail,
  resolveFootballPlayerTab,
} from '@legacy-sports/shared-components/football';
import { config } from '@legacy-sports/app-config/web';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { useFootballPlayerQuery } from '../../api/db/graphql.generated';
import { PageMeta } from '../../components/PageMeta';
import { UpgradeModal } from '../../components/UpgradeModal';
import { useHasEntitlement } from '../../hooks/useIsPremium';
import { storeCameFrom } from '../../lib/came-from';
import { trackPremiumFeatureClick } from '../../utils/analytics';

const FOOTBALL_GAME_LOGS_ENDPOINT = config.statsApiUrl
  ? `${config.statsApiUrl.replace(/\/+$/, '')}/nfl-game-logs`
  : undefined;

const PROJECTIONS_FEATURE_NAME = 'Projections';
const PROJECTIONS_FEATURE_DESCRIPTION =
  'Unlock weekly projections, matchup ratings, and strength-of-schedule for every player with Premium.';

export function FootballPlayerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isValidId = !!id && /^\d+$/.test(id) && parseInt(id, 10) > 0;
  const playerId = isValidId ? parseInt(id, 10) : 0;
  const isPremium = useHasEntitlement(ENTITLEMENTS.football_projections);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const { data, loading, error } = useFootballPlayerQuery({
    variables: { id: playerId },
    skip: !isValidId,
    // Auto-refresh so injury-status changes surface without a manual reload
    // (LS-6252). Apollo pauses polling while the tab is hidden and stops it on
    // unmount; a skipped query (invalid id) does not poll.
    pollInterval: FOOTBALL_PLAYER_DETAIL_POLL_MS,
  });

  function handleUpgrade() {
    trackPremiumFeatureClick(PROJECTIONS_FEATURE_NAME);
    setShowUpgradeModal(true);
  }

  const isAuthError =
    CombinedGraphQLErrors.is(error) &&
    error.errors.some(
      (e) =>
        (e.extensions?.['code'] as string | undefined) === 'UNAUTHENTICATED',
    );

  useEffect(() => {
    if (isAuthError) {
      storeCameFrom();
      navigate('/login', { replace: true });
    }
  }, [isAuthError, navigate]);

  const player = data?.footballPlayer;
  const initialTab = resolveFootballPlayerTab(searchParams.get('tab'));
  const notFound = !isValidId || (!loading && !error && !player);

  return (
    <YStack flex={1} minHeight="100vh">
      <PageMeta
        title={
          [player?.firstName, player?.lastName].filter(Boolean).join(' ') ||
          'Player'
        }
        description={
          player
            ? `${player.position ?? 'Football player'} — ${player.nflTeam ?? ''}`
            : undefined
        }
      />
      <FootballPlayerDetail
        player={player}
        loading={loading}
        error={!!error && !isAuthError}
        notFound={notFound}
        onBack={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate('/football/players');
        }}
        isPremium={isPremium}
        onUpgrade={handleUpgrade}
        initialTab={initialTab}
        gameLogsApiEndpoint={FOOTBALL_GAME_LOGS_ENDPOINT}
      />
      {!isPremium && (
        <UpgradeModal
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          featureName={PROJECTIONS_FEATURE_NAME}
          featureDescription={PROJECTIONS_FEATURE_DESCRIPTION}
        />
      )}
    </YStack>
  );
}

export default FootballPlayerDetailPage;
