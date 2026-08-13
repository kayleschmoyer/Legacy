import React, { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Spinner, Text, YStack } from 'tamagui';
import { useGetLeagueByIdQuery } from '@legacy-sports/graphql';
import { useMatchupById } from '../../hooks/useMatchup';
import { BRAND_NAVY_LIGHT } from '../../constants/colors';

/**
 * Redirects /matchup/:matchupId → /<sport>/league/:leagueId/matchups/:matchupId
 * by fetching the matchup to derive the leagueId, then the league to derive
 * its sport.
 */
export function MatchupRedirectPage() {
  const { matchupId } = useParams<{ matchupId: string }>();
  const navigate = useNavigate();

  const matchupIdNum = matchupId ? parseInt(matchupId, 10) : null;
  const { matchup, loading, error } = useMatchupById(matchupIdNum);

  const leagueId = matchup?.leagueId ?? null;
  const { data: leagueData, loading: leagueLoading } = useGetLeagueByIdQuery({
    variables: { id: leagueId ?? 0 },
    skip: !leagueId,
  });
  const leagueSport = leagueData?.league?.sport ?? 'baseball';

  useEffect(() => {
    if (leagueId && matchupIdNum && !leagueLoading) {
      navigate(`/${leagueSport}/league/${leagueId}/matchups/${matchupIdNum}`, {
        replace: true,
      });
    }
  }, [leagueId, matchupIdNum, leagueSport, leagueLoading, navigate]);

  if (loading || (leagueId && leagueLoading)) {
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

  if (!matchup || !leagueId) {
    return <Navigate to="/" replace />;
  }

  return null;
}
