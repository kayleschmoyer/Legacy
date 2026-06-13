import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { YStack } from 'tamagui';
import { CombinedGraphQLErrors } from '@apollo/client';
import {
  FOOTBALL_PLAYER_DETAIL_POLL_MS,
  FootballPlayerDetail,
  resolveFootballPlayerTab,
} from '@legacy-sports/shared-components/football';
import { useFootballPlayerQuery } from '../../api/db/graphql.generated';
import { PageMeta } from '../../components/PageMeta';
import { UpgradeModal } from '../../components/UpgradeModal';
import { useIsPremium } from '../../hooks/useIsPremium';
import { storeCameFrom } from '../../lib/came-from';
import { trackPremiumFeatureClick } from '../../utils/analytics';

const PROJECTIONS_FEATURE_NAME = 'Projections';
const PROJECTIONS_FEATURE_DESCRIPTION =
  'Unlock weekly projections, matchup ratings, and strength-of-schedule for every player with Premium.';

export function FootballPlayerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const playerId = id ? parseInt(id, 10) : 0;
  const isPremium = useIsPremium();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const { data, loading, error } = useFootballPlayerQuery({
    variables: { id: playerId },
    skip: !playerId,
    // Auto-refresh so injury-status changes surface without a manual reload
    // (LS-6252). Apollo pauses polling while the tab is hidden and stops it on
    // unmount; a skipped query (no playerId) does not poll.
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

  return (
    <YStack flex={1} minHeight="100vh">
      <PageMeta
        title={
          [player?.firstName, player?.lastName].filter(Boolean).join(' ') ||
          'Player'
        }
        description={`${player?.position ?? 'Football player'} — ${player?.nflTeam ?? ''}`}
      />
      <FootballPlayerDetail
        player={player}
        loading={loading}
        error={!!error && !isAuthError}
        onBack={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate('/football/players');
        }}
        isPremium={isPremium}
        onUpgrade={handleUpgrade}
        initialTab={initialTab}
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
