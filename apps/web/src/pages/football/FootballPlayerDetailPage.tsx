import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { YStack } from 'tamagui';
import { CombinedGraphQLErrors } from '@apollo/client';
import { FootballPlayerDetail } from '@legacy-sports/shared-components/football';
import { useFootballPlayerQuery } from '../../api/db/graphql.generated';
import { PageMeta } from '../../components/PageMeta';
import { storeCameFrom } from '../../lib/came-from';

export function FootballPlayerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const playerId = id ? parseInt(id, 10) : 0;

  const { data, loading, error } = useFootballPlayerQuery({
    variables: { id: playerId },
    skip: !playerId,
  });

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
      />
    </YStack>
  );
}

export default FootballPlayerDetailPage;
