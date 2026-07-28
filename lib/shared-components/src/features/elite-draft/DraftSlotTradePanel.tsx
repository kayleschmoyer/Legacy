import React, { useMemo, useState } from 'react';
import {
  type DraftSlotTradeFragment,
  useApproveDraftSlotTradeMutation,
  useGetLeagueDraftSlotTradesQuery,
  useProposeDraftSlotTradeMutation,
  useRespondDraftSlotTradeMutation,
} from '@legacy-sports/graphql';
import type { LeagueTeam } from './types';

export interface DraftSlotTradePanelProps {
  leagueId: number;
  myTeamId: number | null;
  leagueTeams: LeagueTeam[];
  /** Own team's GM or the league commissioner — the only roles that may propose/respond (matches backend resolveOwnTeamForDraftSlotTrade). */
  canManageOwnTeam: boolean;
  isCommissioner: boolean;
  /** Fired after a trade is approved/executed so the caller can refresh the draft order display. */
  onTradeExecuted?: () => void;
}

const HISTORY_STATUSES = new Set(['declined', 'executed', 'cancelled']);

export function DraftSlotTradePanel({
  leagueId,
  myTeamId,
  leagueTeams,
  canManageOwnTeam,
  isCommissioner,
  onTradeExecuted,
}: DraftSlotTradePanelProps): React.JSX.Element | null {
  const [counterpartTeamId, setCounterpartTeamId] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, refetch } = useGetLeagueDraftSlotTradesQuery({
    variables: { leagueId },
    skip: !leagueId,
    fetchPolicy: 'cache-and-network',
  });

  const trades: DraftSlotTradeFragment[] = useMemo(
    () =>
      (data?.leagueDraftSlotTrades ?? []).filter(
        (t): t is DraftSlotTradeFragment => t != null,
      ),
    [data],
  );

  const [proposeTrade, { loading: proposing }] =
    useProposeDraftSlotTradeMutation();
  const [respondToTrade, { loading: responding }] =
    useRespondDraftSlotTradeMutation();
  const [approveTrade, { loading: approving }] =
    useApproveDraftSlotTradeMutation();

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of leagueTeams) map.set(String(team.id), team.name);
    return map;
  }, [leagueTeams]);

  const incoming = trades.filter(
    (t) =>
      t.status === 'proposed' &&
      String(t.counterpartTeamId) === String(myTeamId),
  );
  const outgoing = trades.filter(
    (t) =>
      t.status === 'proposed' && String(t.proposerTeamId) === String(myTeamId),
  );
  const approvalQueue = trades.filter((t) => t.status === 'accepted');
  const history = trades.filter((t) => HISTORY_STATUSES.has(t.status ?? ''));

  const eligibleCounterparts = leagueTeams.filter(
    (t) => String(t.id) !== String(myTeamId),
  );

  if (!canManageOwnTeam && !isCommissioner) {
    // Spectators / co-managers without a tradeable team don't need this panel.
    if (trades.length === 0) return null;
  }

  const handlePropose = async (): Promise<void> => {
    if (!counterpartTeamId) return;
    setActionError(null);
    try {
      await proposeTrade({
        variables: {
          leagueId,
          counterpartTeamId: Number(counterpartTeamId),
        },
      });
      setCounterpartTeamId('');
      await refetch();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to propose trade',
      );
    }
  };

  const handleRespond = async (
    tradeId: number | null | undefined,
    accept: boolean,
  ): Promise<void> => {
    if (tradeId == null) {
      setActionError('Trade ID is missing.');
      return;
    }
    setActionError(null);
    try {
      await respondToTrade({ variables: { tradeId, accept } });
      await refetch();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to respond to trade',
      );
    }
  };

  const handleApprove = async (
    tradeId: number | null | undefined,
  ): Promise<void> => {
    if (tradeId == null) {
      setActionError('Trade ID is missing.');
      return;
    }
    setActionError(null);
    try {
      await approveTrade({ variables: { tradeId } });
      await refetch();
      onTradeExecuted?.();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to approve trade',
      );
    }
  };

  return (
    <div
      data-testid="draft-slot-trade-panel"
      style={{ maxWidth: 320, width: '100%', marginTop: 20 }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: 'var(--d-text-secondary)',
          marginBottom: 8,
        }}
      >
        Draft Slot Trades
      </div>

      {myTeamId != null &&
        canManageOwnTeam &&
        eligibleCounterparts.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <select
              data-testid="trade-panel-counterpart-select"
              value={counterpartTeamId}
              onChange={(e) => setCounterpartTeamId(e.target.value)}
              style={{
                flex: 1,
                background: 'var(--d-surface)',
                border: '1px solid var(--d-border)',
                borderRadius: 6,
                color: 'var(--d-text)',
                fontSize: 12,
                padding: '6px 8px',
                fontFamily: 'inherit',
              }}
            >
              <option value="">Propose trade with…</option>
              {eligibleCounterparts.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <button
              data-testid="trade-panel-propose-btn"
              onClick={() => {
                void handlePropose();
              }}
              disabled={!counterpartTeamId || proposing}
              style={{
                background: 'var(--d-accent)',
                border: 'none',
                borderRadius: 6,
                color: 'white',
                fontSize: 12,
                fontWeight: 700,
                padding: '6px 12px',
                cursor: counterpartTeamId ? 'pointer' : 'default',
                opacity: !counterpartTeamId || proposing ? 0.5 : 1,
                fontFamily: 'inherit',
              }}
            >
              {proposing ? 'Proposing…' : 'Propose'}
            </button>
          </div>
        )}

      {actionError && (
        <div
          style={{
            marginBottom: 10,
            padding: '8px 12px',
            background: 'var(--d-surface)',
            border: '1px solid var(--d-danger)',
            borderRadius: 8,
            color: 'var(--d-danger)',
            fontSize: 12,
          }}
        >
          {actionError}
        </div>
      )}

      {incoming.map((trade) => (
        <div
          key={trade.id}
          data-testid={`trade-incoming-${String(trade.id)}`}
          style={{
            padding: '8px 12px',
            background: 'var(--d-surface)',
            border: '1px solid var(--d-border)',
            borderRadius: 8,
            marginBottom: 6,
            fontSize: 12,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            {trade.proposerTeamName ??
              teamNameById.get(String(trade.proposerTeamId)) ??
              'Unknown Team'}{' '}
            wants to swap draft slots with you
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              data-testid={`trade-accept-${String(trade.id)}`}
              onClick={() => {
                void handleRespond(trade.id, true);
              }}
              disabled={responding}
              style={{
                background: 'var(--d-success)',
                border: 'none',
                borderRadius: 6,
                color: 'white',
                fontSize: 11,
                fontWeight: 700,
                padding: '4px 10px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Accept
            </button>
            <button
              data-testid={`trade-decline-${String(trade.id)}`}
              onClick={() => {
                void handleRespond(trade.id, false);
              }}
              disabled={responding}
              style={{
                background: 'transparent',
                border: '1px solid var(--d-border)',
                borderRadius: 6,
                color: 'var(--d-text-secondary)',
                fontSize: 11,
                fontWeight: 700,
                padding: '4px 10px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Decline
            </button>
          </div>
        </div>
      ))}

      {outgoing.map((trade) => (
        <div
          key={trade.id}
          data-testid={`trade-outgoing-${String(trade.id)}`}
          style={{
            padding: '8px 12px',
            background: 'var(--d-surface)',
            border: '1px solid var(--d-border)',
            borderRadius: 8,
            marginBottom: 6,
            fontSize: 12,
            color: 'var(--d-text-secondary)',
          }}
        >
          Pending: proposed a swap with{' '}
          {trade.counterpartTeamName ??
            teamNameById.get(String(trade.counterpartTeamId)) ??
            'Unknown Team'}
        </div>
      ))}

      {isCommissioner && approvalQueue.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: 'var(--d-accent)',
              marginBottom: 6,
            }}
          >
            Approval Queue
          </div>
          {approvalQueue.map((trade) => (
            <div
              key={trade.id}
              data-testid={`trade-approval-${String(trade.id)}`}
              style={{
                padding: '8px 12px',
                background: 'var(--d-surface)',
                border: '1px solid var(--d-border)',
                borderRadius: 8,
                marginBottom: 6,
                fontSize: 12,
              }}
            >
              <div style={{ marginBottom: 6 }}>
                {trade.proposerTeamName ??
                  teamNameById.get(String(trade.proposerTeamId)) ??
                  'Unknown Team'}{' '}
                ↔{' '}
                {trade.counterpartTeamName ??
                  teamNameById.get(String(trade.counterpartTeamId)) ??
                  'Unknown Team'}
              </div>
              <button
                data-testid={`trade-approve-${String(trade.id)}`}
                onClick={() => {
                  void handleApprove(trade.id);
                }}
                disabled={approving}
                style={{
                  background: 'var(--d-accent)',
                  border: 'none',
                  borderRadius: 6,
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Approve &amp; Execute
              </button>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: 'var(--d-text-muted)',
              cursor: 'pointer',
            }}
          >
            Trade History ({history.length})
          </summary>
          {history.map((trade) => (
            <div
              key={trade.id}
              data-testid={`trade-history-${String(trade.id)}`}
              style={{
                padding: '6px 10px',
                fontSize: 11,
                color: 'var(--d-text-muted)',
                borderBottom: '1px solid var(--d-border)',
              }}
            >
              {trade.proposerTeamName ??
                teamNameById.get(String(trade.proposerTeamId)) ??
                'Unknown Team'}{' '}
              ↔{' '}
              {trade.counterpartTeamName ??
                teamNameById.get(String(trade.counterpartTeamId)) ??
                'Unknown Team'}{' '}
              — {trade.status}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
