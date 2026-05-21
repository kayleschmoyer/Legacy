import React, { useMemo } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import {
  type LeagueFragment,
  useAcceptTradeMutation,
  useCancelTradeMutation,
  useGetLeagueTradeOffersQuery,
  useRejectTradeMutation,
} from '../../../../api/db/graphql.generated';
import { I } from '../Icons';
import {
  Banner,
  colorFromString,
  Empty,
  initialsFromName,
  positionClass,
  Section,
} from '../Shared';

export interface TradesTabProps {
  league: LeagueFragment;
  isMember: boolean;
  myTeamId: number | null;
}

type TradeOffer = NonNullable<
  NonNullable<
    ReturnType<typeof useGetLeagueTradeOffersQuery>['data']
  >['leagueTradeOffers']
>[number];

const PENDING_STATUSES = new Set(['pending']);

const formatRelativeTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const formatDate = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
};

const TradeCard: React.FC<{
  trade: TradeOffer;
  myTeamId: number;
  onAccept: () => void;
  onReject: () => void;
  onWithdraw: () => void;
  pending: boolean;
}> = ({ trade, myTeamId, onAccept, onReject, onWithdraw, pending }) => {
  const isIncoming = trade.receivingTeamId === myTeamId;
  const offeringPlayers = (trade.players ?? []).filter(
    (p) => p.fromTeamId === trade.proposingTeamId,
  );
  const requestingPlayers = (trade.players ?? []).filter(
    (p) => p.fromTeamId === trade.receivingTeamId,
  );

  const fromTeam = trade.proposingTeamName ?? 'Team';
  const toTeam = trade.receivingTeamName ?? 'Team';

  return (
    <div className="ls-trade-card">
      <div className="ls-trade-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className={`ls-chip ${isIncoming ? 'ls-chip-pre' : 'ls-chip-queued'}`}
          >
            {isIncoming ? (
              <>
                <I.ArrowLeft size={10} />
                Incoming
              </>
            ) : (
              <>
                <I.ArrowRight size={10} />
                Outgoing
              </>
            )}
          </span>
          <span className="meta mono">
            Sent {formatRelativeTime(trade.createdAt)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {isIncoming ? (
            <>
              <button
                type="button"
                className="ls-btn ls-btn-gold sm"
                onClick={onAccept}
                disabled={pending}
              >
                <I.Check size={11} />
                Accept
              </button>
              <button
                type="button"
                className="ls-btn ls-btn-danger sm"
                onClick={onReject}
                disabled={pending}
              >
                <I.X size={11} />
                Reject
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ls-btn ls-btn-ghost sm"
              onClick={onWithdraw}
              disabled={pending}
            >
              <I.X size={11} />
              Withdraw
            </button>
          )}
        </div>
      </div>
      <div className="ls-trade-teams">
        <div className="ls-trade-team">
          <div className="thead">
            <div className={`ls-avatar sm ${colorFromString(fromTeam)}`}>
              {initialsFromName(fromTeam)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 13,
                  color: 'var(--fg1)',
                  letterSpacing: '.02em',
                }}
              >
                {fromTeam}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--fg4)',
                }}
              >
                Offering
              </div>
            </div>
          </div>
          {offeringPlayers.length === 0 ? (
            <div className="pline" style={{ color: 'var(--fg4)' }}>
              <span>—</span>
            </div>
          ) : (
            offeringPlayers.map((p) => (
              <div className="pline" key={p.id ?? `${p.playerId}-from`}>
                <span className={`ls-pchip ${positionClass(p.playerPosition)}`}>
                  {p.playerPosition ?? '—'}
                </span>
                <span>{p.playerName ?? 'Unknown player'}</span>
              </div>
            ))
          )}
        </div>
        <div className="ls-trade-arrow">
          <I.ArrowLeftRight size={24} />
        </div>
        <div className="ls-trade-team">
          <div className="thead">
            <div className={`ls-avatar sm ${colorFromString(toTeam)}`}>
              {initialsFromName(toTeam)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 13,
                  color: 'var(--fg1)',
                  letterSpacing: '.02em',
                }}
              >
                {toTeam}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--fg4)',
                }}
              >
                Requesting
              </div>
            </div>
          </div>
          {requestingPlayers.length === 0 ? (
            <div className="pline" style={{ color: 'var(--fg4)' }}>
              <span>—</span>
            </div>
          ) : (
            requestingPlayers.map((p) => (
              <div className="pline" key={p.id ?? `${p.playerId}-to`}>
                <span className={`ls-pchip ${positionClass(p.playerPosition)}`}>
                  {p.playerPosition ?? '—'}
                </span>
                <span>{p.playerName ?? 'Unknown player'}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export const TradesTab: React.FC<TradesTabProps> = ({
  league,
  isMember,
  myTeamId,
}) => {
  const leagueId = league.id ?? 0;
  const { data, loading, error, refetch } = useGetLeagueTradeOffersQuery({
    variables: { leagueId },
    skip: !leagueId,
    errorPolicy: 'all',
  });

  React.useEffect(() => {
    if (error) {
      LOGGER.error('League trade offers query failed', {
        err: error,
        leagueId,
      });
    }
  }, [error, leagueId]);

  const [acceptTrade, acceptState] = useAcceptTradeMutation();
  const [rejectTrade, rejectState] = useRejectTradeMutation();
  const [cancelTrade, cancelState] = useCancelTradeMutation();
  const mutationPending =
    acceptState.loading || rejectState.loading || cancelState.loading;

  const offers = useMemo(
    () => data?.leagueTradeOffers ?? [],
    [data?.leagueTradeOffers],
  );

  const myOffers = useMemo(() => {
    if (myTeamId == null) return [] as TradeOffer[];
    return offers.filter(
      (o) => o.proposingTeamId === myTeamId || o.receivingTeamId === myTeamId,
    );
  }, [offers, myTeamId]);

  const pending = useMemo(
    () => myOffers.filter((o) => PENDING_STATUSES.has(o.status ?? '')),
    [myOffers],
  );
  const completed = useMemo(
    () => offers.filter((o) => o.status === 'accepted').slice(0, 10),
    [offers],
  );

  if (!league.id) {
    return <Empty title="Trades unavailable" sub="League is missing an id." />;
  }

  if (!isMember || myTeamId == null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner
          kind="spectator"
          icon={<I.Eye size={20} />}
          title="Spectator Mode"
          sub="Join the league to propose, accept, and review trades."
        />
        <Section title="Trading Center">
          <Empty
            icon={<I.ArrowLeftRight size={32} />}
            title="Join this league to trade"
            sub="Only league members can view and submit trade offers. Ask the commissioner for an invite."
          />
        </Section>
      </div>
    );
  }

  const runMutation = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await refetch();
    } catch (err) {
      LOGGER.error('Trade mutation failed', { err, leagueId });
    }
  };

  const awaitingMyResponse = pending.filter(
    (o) => o.receivingTeamId === myTeamId,
  ).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Section
        title="Pending Trade Offers"
        sub={
          loading
            ? 'Loading…'
            : `${pending.length} open${
                awaitingMyResponse > 0
                  ? ` · ${awaitingMyResponse} awaiting your response`
                  : ''
              }`
        }
      >
        {error && pending.length === 0 ? (
          <Empty
            icon={<I.AlertTriangle size={28} />}
            title="Couldn't load trade offers"
            sub={error.message}
          />
        ) : pending.length === 0 ? (
          <Empty
            icon={<I.ArrowLeftRight size={28} />}
            title="No pending trade offers"
            sub="Propose a trade from another team's roster to get started."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pending.map((t) => {
              const tradeId = t.id;
              if (tradeId == null) return null;
              return (
                <TradeCard
                  key={tradeId}
                  trade={t}
                  myTeamId={myTeamId}
                  pending={mutationPending}
                  onAccept={() =>
                    void runMutation(() =>
                      acceptTrade({ variables: { tradeId } }),
                    )
                  }
                  onReject={() =>
                    void runMutation(() =>
                      rejectTrade({ variables: { tradeId } }),
                    )
                  }
                  onWithdraw={() =>
                    void runMutation(() =>
                      cancelTrade({ variables: { tradeId } }),
                    )
                  }
                />
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="Completed Trades"
        sub={
          completed.length === 0
            ? 'No completed trades yet'
            : `${completed.length} accepted`
        }
      >
        {completed.length === 0 ? (
          <Empty
            icon={<I.Trophy size={28} />}
            title="No completed trades"
            sub="Accepted trades will appear here."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {completed.map((t) => {
              const offering = (t.players ?? []).filter(
                (p) => p.fromTeamId === t.proposingTeamId,
              );
              const requesting = (t.players ?? []).filter(
                (p) => p.fromTeamId === t.receivingTeamId,
              );
              return (
                <div
                  key={t.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto 1fr auto',
                    gap: 14,
                    padding: '12px 14px',
                    background: 'var(--surface-subtle)',
                    borderRadius: 'var(--radius-3)',
                    border: '1px solid var(--outline-subtle)',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        fontSize: 13,
                        color: 'var(--fg1)',
                      }}
                    >
                      {t.proposingTeamName ?? 'Team'}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 12,
                        color: 'var(--fg3)',
                        marginTop: 2,
                      }}
                    >
                      {offering.length === 0
                        ? '—'
                        : offering.map((p) => p.playerName ?? '—').join(' · ')}
                    </div>
                  </div>
                  <I.ArrowLeftRight
                    size={18}
                    style={{ color: 'var(--brand-gold-light)' }}
                  />
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        fontSize: 13,
                        color: 'var(--fg1)',
                      }}
                    >
                      {t.receivingTeamName ?? 'Team'}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 12,
                        color: 'var(--fg3)',
                        marginTop: 2,
                      }}
                    >
                      {requesting.length === 0
                        ? '—'
                        : requesting
                            .map((p) => p.playerName ?? '—')
                            .join(' · ')}
                    </div>
                  </div>
                  <span className="meta mono" style={{ fontSize: 11 }}>
                    {formatDate(t.respondedAt ?? t.updatedAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
};
