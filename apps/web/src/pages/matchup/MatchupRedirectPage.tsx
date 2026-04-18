import React, { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Spinner, Text, YStack } from 'tamagui';
import { useMatchupById } from '../../hooks/useMatchup';
import { BRAND_NAVY_LIGHT } from '../../constants/colors';

/**
 * Redirects /matchup/:matchupId → /baseball/league/:leagueId/matchups/:matchupId
 * by fetching the matchup to derive the leagueId.
 */
export function MatchupRedirectPage() {
  const { matchupId } = useParams<{ matchupId: string }>();
  const navigate = useNavigate();

  const matchupIdNum = matchupId ? parseInt(matchupId, 10) : null;
  const { matchup, loading, error } = useMatchupById(matchupIdNum);

  useEffect(() => {
    if (matchup?.leagueId && matchupIdNum) {
      navigate(
        `/baseball/league/${matchup.leagueId}/matchups/${matchupIdNum}`,
        {
          replace: true,
        },
      );
    }
  }, [matchup, matchupIdNum, navigate]);

  if (loading) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={400}
      >
        <Spinner size="large" color={BRAND_NAVY_LIGHT} />
        <Text marginTop="$2" color="$gray11">
          Loading matchup...
        </Text>
      </YStack>
    );
  }

  if (error || !matchupIdNum) {
    return <Navigate to="/" replace />;
  }

  if (!matchup) {
    return <Navigate to="/" replace />;
  }

  return null;
}
