import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { YStack } from 'tamagui';
import { FootballPlayerDetail } from '@legacy-sports/shared-components/football';
import { useFootballPlayerQuery } from '../../api/db/graphql.generated';
import { PageMeta } from '../../components/PageMeta';

export function FootballPlayerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const playerId = id ? parseInt(id, 10) : 0;

  const { data, loading, error } = useFootballPlayerQuery({
    variables: { id: playerId },
    skip: !playerId,
  });

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
        error={!!error}
        onBack={() => navigate(-1)}
      />
    </YStack>
  );
}

export default FootballPlayerDetailPage;
