import React, { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LOGGER } from '@legacy-sports/logging';
import {
  useGetTeamTradeOffersQuery,
  useRejectTradeMutation,
} from '../../../../api/db/graphql.generated';
import { Banner } from '../Shared';
import { I } from '../Icons';

export interface PendingTradeOfferBannerProps {
  leagueId: number;
  myTeamId: number;
}

const playerNames = (
  players: ReadonlyArray<{ playerName?: string | null }> | null | undefined,
): string => {
  const names = (players ?? [])
    .map((p) => p.playerName)
    .filter((n): n is string => !!n);
  return names.length === 0 ? '—' : names.join(' · ');
};

export const PendingTradeOfferBanner: React.FC<
  PendingTradeOfferBannerProps
> = ({ leagueId, myTeamId }) => {
  const navigate = useNavigate();
  const { data, refetch } = useGetTeamTradeOffersQuery({
    variables: { teamId: myTeamId, status: 'pending' },
    fetchPolicy: 'cache-and-network',
  });

  const [rejectTrade, { loading: rejecting }] = useRejectTradeMutation();

  const incoming = useMemo(
    () =>
      (data?.teamTradeOffers ?? []).filter(
        (t) => t.receivingTeamId === myTeamId,
      ),
    [data?.teamTradeOffers, myTeamId],
  );

  const handleReview = useCallback(() => {
    navigate(`/baseball/league/${leagueId}/trades`);
  }, [navigate, leagueId]);

  const handleDecline = useCallback(
    async (tradeId: number) => {
      try {
        await rejectTrade({ variables: { tradeId } });
        await refetch();
      } catch (err) {
        // Pass the Error instance as the first non-message arg so Rollbar /
        // LogArgs can extract the stack trace; never wrap it in `{ err }`.
        const errorArg = err instanceof Error ? err : new Error(String(err));
        LOGGER.error('Failed to decline trade offer', errorArg, {
          tradeId,
          leagueId,
        });
      }
    },
    [rejectTrade, refetch, leagueId],
  );

  if (incoming.length === 0) return null;

  return (
    <>
      {incoming.map((trade) => {
        const tradeId = trade.id;
        if (tradeId == null) return null;
        const fromTeam = trade.proposingTeamName ?? 'Team';
        const offering = (trade.players ?? []).filter(
          (p) => p.fromTeamId === trade.proposingTeamId,
        );
        const requesting = (trade.players ?? []).filter(
          (p) => p.fromTeamId === trade.receivingTeamId,
        );
        return (
          <Banner
            key={tradeId}
            kind="info"
            icon={<I.ArrowLeftRight size={18} />}
            title={`Pending Trade Offer from ${fromTeam}`}
            sub={
              <>
                They offer: {playerNames(offering)} → You send:{' '}
                {playerNames(requesting)}
              </>
            }
            actions={
              <>
                <button
                  type="button"
                  className="ls-btn ls-btn-primary sm"
                  onClick={handleReview}
                >
                  <I.Check size={12} />
                  Review
                </button>
                <button
                  type="button"
                  className="ls-btn ls-btn-ghost sm"
                  onClick={() => void handleDecline(tradeId)}
                  disabled={rejecting}
                >
                  <I.X size={12} />
                  Decline
                </button>
              </>
            }
          />
        );
      })}
    </>
  );
};
