// TabTrades.jsx — Pending offers, submit trade, completed trades.

const {
  Icons: TI,
  Section: TSection,
  TeamAvatar: TAvatar,
  posClassOf: tPosClass,
} = window;

const TradeCard = ({ trade, isMember }) => {
  const isIncoming = trade.direction === 'incoming';
  return (
    <div className="ls-trade-card">
      <div className="ls-trade-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className={`ls-chip ${isIncoming ? 'ls-chip-pre' : 'ls-chip-queued'}`}
          >
            {isIncoming ? (
              <>
                <TI.ArrowLeft size={10} />
                Incoming
              </>
            ) : (
              <>
                <TI.ArrowRight size={10} />
                Outgoing
              </>
            )}
          </span>
          <span className="meta mono">Sent {trade.sent}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {isIncoming ? (
            <>
              <button className="ls-btn ls-btn-gold sm">
                <TI.Check size={11} />
                Accept
              </button>
              <button className="ls-btn ls-btn-danger sm">
                <TI.X size={11} />
                Reject
              </button>
            </>
          ) : (
            <button className="ls-btn ls-btn-ghost sm">
              <TI.X size={11} />
              Withdraw
            </button>
          )}
        </div>
      </div>
      <div className="ls-trade-teams">
        <div className="ls-trade-team">
          <div className="thead">
            <div className={`ls-avatar sm ${trade.fromColor}`}>
              {trade.fromMgr
                .split(' ')
                .map((s) => s[0])
                .join('')}
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
                {trade.fromTeam}
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
          {trade.offered.map((p, i) => (
            <div className="pline" key={i}>
              <span className={`ls-pchip ${tPosClass(p.pos)}`}>{p.pos}</span>
              <span>{p.name}</span>
            </div>
          ))}
        </div>
        <div className="ls-trade-arrow">
          <TI.ArrowLeftRight size={24} />
        </div>
        <div className="ls-trade-team">
          <div className="thead">
            <div className={`ls-avatar sm ${trade.toColor}`}>
              {trade.toMgr
                .split(' ')
                .map((s) => s[0])
                .join('')}
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
                {trade.toTeam}
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
          {trade.requested.map((p, i) => (
            <div className="pline" key={i}>
              <span className={`ls-pchip ${tPosClass(p.pos)}`}>{p.pos}</span>
              <span>{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const TabTrades = ({ isMember }) => {
  const [showProposal, setShowProposal] = React.useState(false);

  if (!isMember) {
    return (
      <TSection title="Trading Center">
        <div className="ls-empty">
          <div className="ls-empty-icon">
            <TI.ArrowLeftRight size={32} />
          </div>
          <h3>Join this league to trade</h3>
          <p>
            Only league members can view and submit trade offers. Ask the
            commissioner for an invite.
          </p>
          <button className="ls-btn ls-btn-gold">Join League</button>
        </div>
      </TSection>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <TSection
        title="Pending Trade Offers"
        sub={`${window.PENDING_TRADES.length} open · 1 awaiting your response`}
        right={
          <button
            className="ls-btn ls-btn-gold sm"
            onClick={() => setShowProposal(!showProposal)}
          >
            <TI.Plus size={12} />
            New Trade
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {window.PENDING_TRADES.map((t) => (
            <TradeCard key={t.id} trade={t} isMember={isMember} />
          ))}
        </div>
      </TSection>

      {showProposal && (
        <TSection
          title="Propose a Trade"
          sub="Select target team and shuffle players between rosters"
        >
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
          >
            <div className="ls-field">
              <label>Target Team</label>
              <select className="ls-select">
                {window.TEAMS.filter((t) => t.id !== window.MY_TEAM_ID).map(
                  (t) => (
                    <option key={t.id}>
                      {t.name} · {t.mgr}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="ls-field">
              <label>Expiration</label>
              <select className="ls-select">
                <option>48 hours</option>
                <option>72 hours</option>
                <option>1 week</option>
              </select>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              marginTop: 8,
            }}
          >
            <div>
              <label
                className="eyebrow"
                style={{ display: 'block', marginBottom: 8 }}
              >
                You Offer
              </label>
              <div
                style={{
                  padding: 20,
                  border: '1px dashed var(--outline-default)',
                  borderRadius: 'var(--radius-3)',
                  textAlign: 'center',
                  color: 'var(--fg4)',
                  fontSize: 13,
                }}
              >
                Drag players from your roster
              </div>
            </div>
            <div>
              <label
                className="eyebrow"
                style={{ display: 'block', marginBottom: 8 }}
              >
                You Request
              </label>
              <div
                style={{
                  padding: 20,
                  border: '1px dashed var(--outline-default)',
                  borderRadius: 'var(--radius-3)',
                  textAlign: 'center',
                  color: 'var(--fg4)',
                  fontSize: 13,
                }}
              >
                Drag players from their roster
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 14,
              justifyContent: 'flex-end',
            }}
          >
            <button
              className="ls-btn ls-btn-ghost"
              onClick={() => setShowProposal(false)}
            >
              Cancel
            </button>
            <button className="ls-btn ls-btn-gold">Submit Proposal</button>
          </div>
        </TSection>
      )}

      <TSection title="Completed Trades" sub="Last 30 days · 2 accepted">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {window.COMPLETED_TRADES.map((t) => (
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
                  {t.teamA}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    color: 'var(--fg3)',
                    marginTop: 2,
                  }}
                >
                  {t.playersA.map((p) => p.name).join(' · ')}
                </div>
              </div>
              <TI.ArrowLeftRight
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
                  {t.teamB}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    color: 'var(--fg3)',
                    marginTop: 2,
                  }}
                >
                  {t.playersB.map((p) => p.name).join(' · ')}
                </div>
              </div>
              <span className="meta mono" style={{ fontSize: 11 }}>
                {t.when}
              </span>
            </div>
          ))}
        </div>
      </TSection>
    </div>
  );
};

Object.assign(window, { TabTrades });
