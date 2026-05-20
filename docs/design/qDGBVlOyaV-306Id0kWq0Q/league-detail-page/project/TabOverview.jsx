// TabOverview.jsx — Overview tab with matchup card, snapshot bar, activity/chat/scoring sub-tabs + sidebar.

const {
  Icons: OI,
  Section: OvSection,
  Banner: OvBanner,
  Rank: OvRank,
  TeamAvatar: OvAvatar,
} = window;

const Snapshot = ({ league, startersCount, benchCount }) => (
  <div className="ls-snapshot">
    {[
      ['Teams', league.teamCount],
      ['Roster Size', league.maxRosterSize],
      ['Games / Matchup', league.gamesPerMatchup],
      ['Matchup Length', league.matchupDurationDays, 'days'],
      ['My Starters', startersCount],
    ].map(([label, v, unit]) => (
      <div key={label} className="ls-snap-stat">
        <div className="label">{label}</div>
        <div className="value">
          {v}
          {unit && <span className="unit">{unit}</span>}
        </div>
      </div>
    ))}
  </div>
);

const MatchupScoreboardCard = ({
  me,
  opp,
  week,
  gamesLeft,
  totalGames,
  onView,
  onTeam,
}) => {
  const meLeading = me.actual >= opp.actual;
  return (
    <div className="ls-card ls-matchup-card">
      <div className="ls-matchup-status-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="ls-chip ls-chip-live">
            <span className="ls-dot ls-pulse" />
            Live · Week {week}
          </span>
          <span className="meta">Matchup {week}/22</span>
        </div>
        <button className="ls-btn ls-btn-ghost sm" onClick={onView}>
          View Details <OI.ArrowRight size={12} />
        </button>
      </div>
      <div className="ls-matchup-body">
        <div className={`ls-matchup-side ${meLeading ? 'leading' : ''}`}>
          <OvAvatar
            team={{
              name: me.name,
              color: me.color,
              mgrInitials: me.mgrInitials,
            }}
            size="md"
          />
          <div className="ls-team-name" onClick={() => onTeam(me.id)}>
            {me.name}
          </div>
          <div className="ls-team-record mono">
            {me.w}-{me.l}
            {me.t ? `-${me.t}` : ''}
          </div>
          <div className="ls-score-big score">{me.actual.toFixed(1)}</div>
          <div className="ls-score-proj mono">{me.proj.toFixed(1)} proj</div>
        </div>
        <div className="ls-vs">VS</div>
        <div className={`ls-matchup-side ${!meLeading ? 'leading' : ''}`}>
          <OvAvatar
            team={{
              name: opp.name,
              color: opp.color,
              mgrInitials: opp.mgrInitials,
            }}
            size="md"
          />
          <div className="ls-team-name" onClick={() => onTeam(opp.id)}>
            {opp.name}
          </div>
          <div className="ls-team-record mono">
            {opp.w}-{opp.l}
            {opp.t ? `-${opp.t}` : ''}
          </div>
          <div className="ls-score-big score">{opp.actual.toFixed(1)}</div>
          <div className="ls-score-proj mono">{opp.proj.toFixed(1)} proj</div>
        </div>
      </div>
      <div className="ls-matchup-footer">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--fg3)',
            fontSize: 12,
          }}
        >
          <OI.Clock size={14} /> {gamesLeft} of {totalGames} games remaining
          this matchup
        </div>
        <div style={{ flex: 1, maxWidth: 240, marginLeft: 16 }}>
          <div className="ls-progress">
            <div
              className="ls-progress-fill"
              style={{
                width: `${((totalGames - gamesLeft) / totalGames) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const ActivityFeed = ({ items }) => (
  <div className="ls-activity">
    {items.map((a) => (
      <div key={a.id} className="ls-activity-item">
        <div className={`ls-activity-icon ${a.tint || ''}`}>
          {a.icon === 'zap' && <OI.Zap size={16} />}
          {a.icon === 'edit' && <OI.Edit size={16} />}
          {a.icon === 'swap' && <OI.Swap size={16} />}
          {a.icon === 'trophy' && <OI.Trophy size={16} />}
          {a.icon === 'shield' && <OI.Shield size={16} />}
          {a.icon === 'matchup' &&
            (window.SPORT === 'football' ? (
              <OI.Football size={16} />
            ) : (
              <OI.Baseball size={16} />
            ))}
        </div>
        <div className="ls-activity-body">
          <div className="ls-activity-title">
            {a.team && <b>{a.team}</b>} {a.team ? ' ' : ''}
            <span dangerouslySetInnerHTML={{ __html: a.text }} />
          </div>
          <div className="ls-activity-time">{a.time}</div>
        </div>
      </div>
    ))}
  </div>
);

const ChatPanel = () => {
  const [msgs, setMsgs] = React.useState(window.CHAT_MSGS);
  const [text, setText] = React.useState('');
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [msgs]);
  const send = () => {
    if (!text.trim()) return;
    setMsgs([
      ...msgs,
      {
        id: Date.now(),
        user: 'Mickey J.',
        initials: 'MJ',
        color: 'navy',
        time: 'now',
        text,
      },
    ]);
    setText('');
  };
  return (
    <div className="ls-chat">
      <div className="ls-chat-messages" ref={ref}>
        {msgs.map((m) =>
          m.type === 'system' ? (
            <div key={m.id} className="ls-system-msg">
              · {m.text} ·
            </div>
          ) : (
            <div key={m.id} className="ls-chat-msg">
              <div className={`ls-avatar sm ${m.color}`}>{m.initials}</div>
              <div className="ls-chat-body">
                <div className="ls-chat-meta">
                  <span className="user">{m.user}</span>
                  <span>{m.time}</span>
                </div>
                <div
                  className="ls-chat-text"
                  dangerouslySetInnerHTML={{ __html: m.text }}
                />
              </div>
            </div>
          ),
        )}
      </div>
      <div className="ls-chat-input">
        <input
          placeholder="Message your league…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="ls-btn ls-btn-gold sm" onClick={send}>
          <OI.Send size={12} />
        </button>
      </div>
    </div>
  );
};

const ScoringSummary = () => {
  const r = window.SCORING_RULES;
  const sections = window.SPORT_CONFIG?.scoringSections || [
    { id: 'batting', title: 'Batting' },
    { id: 'pitching', title: 'Pitching' },
    { id: 'fielding', title: 'Fielding' },
  ];
  const Col = ({ title, rows }) => (
    <div className="ls-scoring-col">
      <h5>{title}</h5>
      {(rows || []).map((row) => (
        <div className="ls-scoring-row" key={row.stat}>
          <span className="stat">{row.stat}</span>
          <span className={`val ${row.neg ? 'neg' : ''}`}>{row.val}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="ls-scoring-grid">
      {sections.map((s) => (
        <Col key={s.id} title={s.title} rows={r[s.id]} />
      ))}
    </div>
  );
};

const QuickStandings = ({ teams, myId, onTeam, onViewAll }) => (
  <OvSection
    title="Standings"
    sub="Top 6 · Week 14"
    right={
      <button className="ls-btn ls-btn-ghost sm" onClick={onViewAll}>
        View <OI.ArrowRight size={11} />
      </button>
    }
  >
    <div className="ls-qstandings">
      {teams.slice(0, 6).map((t) => (
        <div
          key={t.id}
          className={`ls-qstandings-row ${t.id === myId ? 'me' : ''}`}
          onClick={() => onTeam(t.id)}
        >
          <OvRank n={t.rank} />
          <div className={`ls-avatar sm ${t.color}`}>{t.mgrInitials}</div>
          <div className="ls-qstandings-name">{t.name}</div>
          <div className="ls-qstandings-record mono">
            {t.w}-{t.l}
            {t.t ? `-${t.t}` : ''}
          </div>
        </div>
      ))}
    </div>
    <div
      style={{
        textAlign: 'center',
        paddingTop: 8,
        fontSize: 12,
        color: 'var(--fg4)',
      }}
    >
      + {teams.length - 6} more teams
    </div>
  </OvSection>
);

const DuesDashboard = ({ dues, league }) => {
  const paid = dues.filter((d) => d.status === 'paid').length;
  const total = dues.length;
  const pct = Math.round((paid / total) * 100);
  const pending = dues.filter((d) => d.status !== 'paid');
  return (
    <OvSection
      title="League Dues"
      sub={`$${league.duesAmount} per team · Due ${league.duesDueDate}`}
      right={
        <span className="ls-chip ls-chip-pre">
          <OI.Dollar size={10} />
          Enabled
        </span>
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 800,
            color: 'var(--fg1)',
            letterSpacing: '-.02em',
            lineHeight: 1,
          }}
        >
          {paid}
          <span style={{ color: 'var(--fg4)', fontWeight: 600 }}>/{total}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg3)' }}>
          teams paid · ${paid * league.duesAmount} collected
        </div>
      </div>
      <div
        style={{
          height: 6,
          background: 'var(--surface-3)',
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--gold)',
            borderRadius: 3,
          }}
        />
      </div>
      {pending.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: 'var(--fg4)',
              marginBottom: 4,
            }}
          >
            Outstanding
          </div>
          {pending.map((d) => (
            <div className="ls-dues-row" key={d.team}>
              <span style={{ color: 'var(--fg1)' }}>{d.team}</span>
              <span className="status pending">
                <OI.Clock size={11} />
                Pending
              </span>
            </div>
          ))}
        </div>
      )}
    </OvSection>
  );
};

const InviteCard = ({ league }) => {
  const [copied, setCopied] = React.useState(null);
  const [qr, setQr] = React.useState(false);
  const copy = (what, text) => {
    navigator.clipboard?.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <OvSection
      title="Invite Friends"
      sub="Share your league with up to 12 managers."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: 'var(--fg4)',
              marginBottom: 6,
            }}
          >
            Invite Link
          </div>
          <div className="ls-invite-link">
            <input readOnly value={`https://${league.inviteLink}`} />
            <button
              className={`ls-copy-btn ${copied === 'link' ? 'ok' : ''}`}
              onClick={() => copy('link', `https://${league.inviteLink}`)}
            >
              {copied === 'link' ? (
                <>
                  <OI.Check size={11} />
                  Copied
                </>
              ) : (
                <>
                  <OI.Copy size={11} />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: 'var(--fg4)',
              marginBottom: 6,
            }}
          >
            Invite Code
          </div>
          <div className="ls-invite-link">
            <input readOnly value={league.inviteCode} />
            <button
              className={`ls-copy-btn ${copied === 'code' ? 'ok' : ''}`}
              onClick={() => copy('code', league.inviteCode)}
            >
              {copied === 'code' ? (
                <>
                  <OI.Check size={11} />
                  Copied
                </>
              ) : (
                <>
                  <OI.Copy size={11} />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
        <button className="ls-btn ls-btn-gold block" onClick={() => setQr(!qr)}>
          <OI.QrCode size={12} /> {qr ? 'Hide' : 'Show'} QR Code to Invite
        </button>
        {qr && (
          <div className="ls-qr">
            <svg viewBox="0 0 100 100" width="156" height="156">
              {[...Array(11)].map((_, y) =>
                [...Array(11)].map((_, x) => {
                  const seed = (x * 7 + y * 13 + x * y) % 5;
                  if (seed < 2)
                    return (
                      <rect
                        key={`${x}-${y}`}
                        x={x * 8 + 6}
                        y={y * 8 + 6}
                        width="7"
                        height="7"
                        fill="#0A0F1A"
                      />
                    );
                  return null;
                }),
              )}
              <rect
                x="6"
                y="6"
                width="23"
                height="23"
                fill="none"
                stroke="#0A0F1A"
                strokeWidth="3"
              />
              <rect x="12" y="12" width="11" height="11" fill="#0A0F1A" />
              <rect
                x="71"
                y="6"
                width="23"
                height="23"
                fill="none"
                stroke="#0A0F1A"
                strokeWidth="3"
              />
              <rect x="77" y="12" width="11" height="11" fill="#0A0F1A" />
              <rect
                x="6"
                y="71"
                width="23"
                height="23"
                fill="none"
                stroke="#0A0F1A"
                strokeWidth="3"
              />
              <rect x="12" y="77" width="11" height="11" fill="#0A0F1A" />
            </svg>
          </div>
        )}
      </div>
    </OvSection>
  );
};

const AwardVotingPanel = () => {
  const [votes, setVotes] = React.useState({});
  return (
    <OvSection
      title="Season Awards"
      sub="Voting closes in 4 days · Select your pick for each award"
      right={
        <span className="ls-chip ls-chip-pre">
          <OI.Award size={10} />
          Open
        </span>
      }
    >
      <div className="ls-award-grid">
        {window.AWARDS.map((a) => (
          <div className="ls-award-card" key={a.id}>
            <h5>{a.label}</h5>
            <div className="ls-radio-list">
              {a.candidates.map((c) => (
                <label
                  key={c}
                  className={`ls-radio ${votes[a.id] === c ? 'on' : ''}`}
                >
                  <input
                    type="radio"
                    name={a.id}
                    style={{ display: 'none' }}
                    onChange={() => setVotes({ ...votes, [a.id]: c })}
                  />
                  <span className="dot" />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </OvSection>
  );
};

const TabOverview = ({ league, isCommissioner, onTab, onTeam }) => {
  const [sub, setSub] = React.useState('activity');
  const isFootball = window.SPORT === 'football';
  const me =
    window.TEAMS.find((t) => t.id === window.MY_TEAM_ID) || window.TEAMS[0];
  const opp = window.TEAMS[window.TEAMS.length - 1];
  const currentMatchup = {
    me: {
      ...me,
      actual: isFootball ? 92.6 : 87.4,
      proj: isFootball ? 132.8 : 142.8,
    },
    opp: {
      ...opp,
      actual: isFootball ? 78.3 : 74.2,
      proj: isFootball ? 118.4 : 118.3,
    },
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {league.draftStatus === 'drafting' && (
        <OvBanner
          kind="live"
          icon={<OI.Zap size={20} />}
          title="Draft Is Live"
          sub={
            isFootball
              ? 'Round 6 of 17 · Monsters of Midway on the clock'
              : 'Round 8 of 23 · Bronx Bombers on the clock'
          }
          actions={
            <button className="ls-btn ls-btn-seam sm">
              <OI.PlayCircle size={12} />
              Join Draft Room
            </button>
          }
        />
      )}
      {isCommissioner && (
        <OvBanner
          kind="gold"
          icon={<OI.Bell size={20} />}
          title="Commissioner Announcement"
          sub={
            isFootball
              ? 'Trade deadline set to Week 13. Post-deadline, only commissioner-approved trades will process.'
              : 'Trade deadline moved to Week 18. Post-deadline, only commissioner-approved trades will process.'
          }
          actions={<button className="ls-btn ls-btn-ghost sm">Dismiss</button>}
        />
      )}

      <AwardVotingPanel />

      <MatchupScoreboardCard
        me={currentMatchup.me}
        opp={currentMatchup.opp}
        week={league.currentWeek}
        gamesLeft={2}
        totalGames={league.gamesPerMatchup}
        onView={() => onTab('matchup')}
        onTeam={onTeam}
      />

      <Snapshot league={league} startersCount={12} benchCount={5} />

      <div className="ls-overview-grid">
        <div className="ls-overview-main">
          <OvSection
            title={
              sub === 'activity'
                ? 'Recent Activity'
                : sub === 'chat'
                  ? 'League Chat'
                  : 'Scoring Rules'
            }
            sub={
              sub === 'activity'
                ? 'Trades, waivers, matchups, commissioner actions'
                : sub === 'chat'
                  ? 'Real-time · 12 managers'
                  : 'How points are calculated'
            }
            right={
              <div className="ls-subtabs">
                {['activity', 'chat', 'scoring'].map((s) => (
                  <button
                    key={s}
                    className={sub === s ? 'on' : ''}
                    onClick={() => setSub(s)}
                  >
                    {s === 'activity'
                      ? 'Activity'
                      : s === 'chat'
                        ? 'Chat'
                        : 'Scoring'}
                  </button>
                ))}
              </div>
            }
          >
            {sub === 'activity' && <ActivityFeed items={window.ACTIVITY} />}
            {sub === 'chat' && <ChatPanel />}
            {sub === 'scoring' && <ScoringSummary />}
          </OvSection>
        </div>

        <div className="ls-overview-side">
          <QuickStandings
            teams={window.TEAMS}
            myId={window.MY_TEAM_ID}
            onTeam={onTeam}
            onViewAll={() => onTab('standings')}
          />
          {league.duesEnabled && (
            <DuesDashboard dues={window.DUES} league={league} />
          )}
          <InviteCard league={league} />
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { TabOverview });
