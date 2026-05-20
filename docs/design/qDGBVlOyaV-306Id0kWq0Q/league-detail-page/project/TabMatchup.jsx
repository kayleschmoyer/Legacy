// TabMatchup.jsx — Full matchup detail view with scoreboard hero, games remaining + side-by-side rosters.

const {
  Icons: MI,
  Section: MSection,
  PlayerRow: MPlayerRow,
  TeamAvatar: MAvatar,
} = window;

const ScoreboardHero = ({ me, opp, week, onTeam }) => {
  const meLead = me.actual >= opp.actual;
  return (
    <div className="ls-scoreboard-hero">
      <div className="top-band">
        <div className="band-left">
          <span className="ls-chip ls-chip-live">
            <span className="ls-dot ls-pulse" />
            Live · Week {week}
          </span>
          <span className="meta">Head-to-Head · Matchup {week}</span>
        </div>
        <div className="band-right">
          <span className="meta mono">Ends Sun 11:59 PM ET</span>
        </div>
      </div>
      <div className="body">
        <div className={`side ${meLead ? 'leading' : ''}`}>
          <MAvatar
            team={{
              name: me.name,
              color: me.color,
              mgrInitials: me.mgrInitials,
            }}
            size="lg"
          />
          <div
            className="name"
            onClick={() => onTeam(me.id)}
            style={{ cursor: 'pointer' }}
          >
            {me.name}
          </div>
          <div className="record mono">
            {me.w}-{me.l} · {me.mgr}
          </div>
          <div className="score-huge">{me.actual.toFixed(1)}</div>
          <div className="proj mono">{me.proj.toFixed(1)} projected</div>
        </div>
        <div className="vs-big">VS</div>
        <div className={`side ${!meLead ? 'leading' : ''}`}>
          <MAvatar
            team={{
              name: opp.name,
              color: opp.color,
              mgrInitials: opp.mgrInitials,
            }}
            size="lg"
          />
          <div
            className="name"
            onClick={() => onTeam(opp.id)}
            style={{ cursor: 'pointer' }}
          >
            {opp.name}
          </div>
          <div className="record mono">
            {opp.w}-{opp.l} · {opp.mgr}
          </div>
          <div className="score-huge">{opp.actual.toFixed(1)}</div>
          <div className="proj mono">{opp.proj.toFixed(1)} projected</div>
        </div>
      </div>
    </div>
  );
};

const GamesRemaining = ({ total, played, live }) => {
  const dots = [];
  for (let i = 0; i < total; i++) {
    let kind = 'pending';
    if (i < played) kind = 'done';
    else if (i < played + live) kind = 'live';
    dots.push(kind);
  }
  const pct = Math.round((played / total) * 100);
  return (
    <div className="ls-games-remaining">
      <div className="ls-games-row">
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'var(--fg1)',
            }}
          >
            Games Remaining
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: 'var(--fg3)',
              marginTop: 2,
            }}
          >
            <span className="mono" style={{ color: 'var(--fg1-strong)' }}>
              {played}
            </span>{' '}
            of <span className="mono">{total}</span> complete ·{' '}
            <span className="mono">{live}</span> in progress ·{' '}
            <span className="mono">{total - played - live}</span> pending
          </div>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 28,
            color: 'var(--brand-gold-light)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {pct}%
        </div>
      </div>
      <div className="ls-progress">
        <div className="ls-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="ls-games-dots">
        {dots.map((k, i) => (
          <div key={i} className={`ls-game-dot ${k}`} />
        ))}
      </div>
    </div>
  );
};

const RosterCompare = ({ me, opp, mePlayers, oppPlayers }) => {
  const meTotal = mePlayers.reduce((s, p) => s + p.actual, 0);
  const oppTotal = oppPlayers.reduce((s, p) => s + p.actual, 0);
  const best = (list) => {
    const m = Math.max(...list.map((p) => p.actual));
    return list.findIndex((p) => p.actual === m);
  };
  const meBest = best(mePlayers);
  const oppBest = best(oppPlayers);
  return (
    <div className="ls-roster-compare">
      <div className="ls-roster-col">
        <div className="ls-roster-col-head">
          <span className="name">{me.name}</span>
          <span className="total">{meTotal.toFixed(1)}</span>
        </div>
        {mePlayers.map((p, i) => (
          <MPlayerRow key={i} p={p} showActions={false} best={i === meBest} />
        ))}
      </div>
      <div className="ls-roster-col">
        <div className="ls-roster-col-head">
          <span className="name">{opp.name}</span>
          <span className="total">{oppTotal.toFixed(1)}</span>
        </div>
        {oppPlayers.map((p, i) => (
          <MPlayerRow
            key={i}
            p={{
              ...p,
              slot: p.slot,
              pos: p.slot,
              stat: '',
              era: p.era,
              team: p.team,
            }}
            showActions={false}
            best={i === oppBest}
          />
        ))}
      </div>
    </div>
  );
};

const TabMatchup = ({ league, onTeam }) => {
  const [week, setWeek] = React.useState(league.currentWeek);
  const isFootball = window.SPORT === 'football';
  const me =
    window.TEAMS.find((t) => t.id === window.MY_TEAM_ID) || window.TEAMS[0];
  const opp =
    window.TEAMS.find((t) => t.id !== me.id && t.rank === me.rank + 7) ||
    window.TEAMS[7];
  const meActual = isFootball ? 92.6 : 87.4;
  const meProj = isFootball ? 132.8 : 142.8;
  const oppActual = isFootball ? 78.3 : 74.2;
  const oppProj = isFootball ? 118.4 : 118.3;
  const meMatch = { ...me, actual: meActual, proj: meProj };
  const oppMatch = { ...opp, actual: oppActual, proj: oppProj };
  // Football: games are NFL Sunday slate (≈13 played starters); baseball: 52 games over 7 days.
  const totalGames = isFootball ? 10 : 52;
  const playedGames = isFootball ? 6 : 24;
  const liveGames = isFootball ? 1 : 4;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="ls-week-nav">
        <div className="ls-week-nav-left">
          <button
            className="ls-navbtn"
            onClick={() => setWeek(Math.max(1, week - 1))}
            disabled={week === 1}
          >
            <MI.ChevronLeft size={16} />
          </button>
          <div>
            <div className="ls-week-title">Week {week} · Matchup</div>
            <div className="meta" style={{ fontSize: 12, marginTop: 2 }}>
              {isFootball
                ? 'Thu Nov 12 – Mon Nov 16, 2026'
                : 'Apr 14 – Apr 20, 2026'}
            </div>
          </div>
          <button
            className="ls-navbtn"
            onClick={() => setWeek(Math.min(league.totalMatchups, week + 1))}
            disabled={week === league.totalMatchups}
          >
            <MI.ChevronRight size={16} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {week !== league.currentWeek && (
            <button
              className="ls-btn ls-btn-ghost sm"
              onClick={() => setWeek(league.currentWeek)}
            >
              Current Week
            </button>
          )}
          <select className="ls-select">
            <option>All Matchups · Week {week}</option>
            {(() => {
              const ts = window.TEAMS || [];
              const pairs = [];
              for (let i = 0; i < ts.length; i += 2) {
                if (ts[i + 1])
                  pairs.push(
                    `${ts[i].name.split(' ')[0]} vs ${ts[i + 1].name.split(' ')[0]}`,
                  );
              }
              return pairs.slice(0, 4).map((p) => <option key={p}>{p}</option>);
            })()}
          </select>
        </div>
      </div>

      <ScoreboardHero me={meMatch} opp={oppMatch} week={week} onTeam={onTeam} />

      <GamesRemaining
        total={totalGames}
        played={playedGames}
        live={liveGames}
      />

      <MSection
        title="Roster Comparison"
        sub="Side-by-side lineups with live matchup scoring · Click a player for stats"
      >
        <RosterCompare
          me={meMatch}
          opp={oppMatch}
          mePlayers={window.MY_ROSTER}
          oppPlayers={window.OPP_ROSTER}
        />
      </MSection>

      <MSection
        title="Matchup Schedule"
        right={<span className="meta mono">Local Time</span>}
      >
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-3)',
                background: 'rgba(34,197,94,.12)',
                border: '1px solid rgba(34,197,94,.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#22C55E',
              }}
            >
              <MI.PlayCircle size={18} />
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  color: 'var(--fg3)',
                }}
              >
                Matchup Start
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  color: 'var(--fg1)',
                  marginTop: 2,
                }}
              >
                Mon Apr 14, 2026 · <span className="mono">12:00 AM</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-3)',
                background: 'rgba(196,30,58,.14)',
                border: '1px solid rgba(196,30,58,.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#E63950',
              }}
            >
              <MI.Flame size={18} />
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  color: 'var(--fg3)',
                }}
              >
                Matchup End
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  color: 'var(--fg1)',
                  marginTop: 2,
                }}
              >
                Sun Apr 20, 2026 · <span className="mono">11:59 PM</span>
              </div>
            </div>
          </div>
        </div>
      </MSection>
    </div>
  );
};

Object.assign(window, { TabMatchup });
