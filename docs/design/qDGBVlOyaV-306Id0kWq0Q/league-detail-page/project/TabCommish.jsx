// TabCommish.jsx — Commissioner accordion with all control sections.

const { Icons: CI } = window;

const BB_LEAGUE_FIELDS = (
  <>
    <div className="ls-field">
      <label>Games per Matchup</label>
      <input className="ls-input" defaultValue="52" />
      <div className="hint">Max games each roster plays per week</div>
    </div>
    <div className="ls-field">
      <label>SP Starts per Matchup</label>
      <input className="ls-input" defaultValue="12" />
      <div className="hint">Cap on starting pitcher appearances</div>
    </div>
    <div className="ls-field">
      <label>Min Career Games</label>
      <input className="ls-input" defaultValue="50" />
    </div>
    <div className="ls-field">
      <label>Min Career Seasons</label>
      <input className="ls-input" defaultValue="1" />
    </div>
  </>
);

const FB_LEAGUE_FIELDS = (
  <>
    <div className="ls-field">
      <label>Lineup Format</label>
      <select className="ls-select" defaultValue="std">
        <option value="std">
          Standard · 1 QB · 2 RB · 3 WR · 1 TE · 1 FLEX · 1 K · 1 DEF
        </option>
        <option>Superflex · adds 2nd QB-eligible</option>
        <option>IDP · adds Individual Defensive Players</option>
      </select>
    </div>
    <div className="ls-field">
      <label>Reception Scoring</label>
      <select className="ls-select" defaultValue="ppr">
        <option value="ppr">PPR · 1.0 pt / reception</option>
        <option>Half-PPR · 0.5 pt / reception</option>
        <option>Standard · No reception bonus</option>
      </select>
    </div>
    <div className="ls-field">
      <label>Min Career Games</label>
      <input className="ls-input" defaultValue="16" />
    </div>
    <div className="ls-field">
      <label>Min Career Seasons</label>
      <input className="ls-input" defaultValue="1" />
    </div>
  </>
);

const Accord = ({
  id,
  title,
  icon,
  tint,
  openId,
  setOpenId,
  badge,
  children,
}) => {
  const open = openId === id;
  return (
    <div className={`ls-accord ${open ? 'open' : ''}`}>
      <button
        className="ls-accord-head"
        onClick={() => setOpenId(open ? null : id)}
      >
        <div className="ls-accord-title">
          <div className={`icon-wrap ${tint || ''}`}>{icon}</div>
          <div>
            <div className="label">{title}</div>
          </div>
          {badge}
        </div>
        <CI.ChevronDown size={18} className="ls-chev" />
      </button>
      {open && <div className="ls-accord-body">{children}</div>}
    </div>
  );
};

const Toggle = ({ on, onChange, label, hint }) => (
  <div className="ls-toggle-row">
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          color: 'var(--fg1)',
        }}
      >
        {label}
      </div>
      {hint && (
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--fg4)',
            marginTop: 2,
          }}
        >
          {hint}
        </div>
      )}
    </div>
    <div
      className={`ls-toggle ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
    />
  </div>
);

const TabCommish = ({ league }) => {
  const [open, setOpen] = React.useState('next');
  const [playoffEnabled, setPlayoffEnabled] = React.useState(true);
  const [multiWeek, setMultiWeek] = React.useState(false);
  const [faab, setFaab] = React.useState(true);
  const [confirm, setConfirm] = React.useState(false);
  const isFootball = window.SPORT === 'football';
  const sections = window.SPORT_CONFIG?.scoringSections || [
    { id: 'batting', title: 'Batting' },
    { id: 'pitching', title: 'Pitching' },
    { id: 'fielding', title: 'Fielding' },
  ];

  return (
    <div className="ls-accordion">
      <Accord
        id="next"
        title="Next Step"
        icon={<CI.Zap size={18} style={{ color: 'var(--brand-gold-light)' }} />}
        tint="gold"
        openId={open}
        setOpenId={setOpen}
        badge={
          <span
            className="ls-chip ls-chip-active"
            style={{ marginLeft: 8, fontSize: 9 }}
          >
            Ready
          </span>
        }
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '12px 0',
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 14,
                color: 'var(--fg1)',
                letterSpacing: '.04em',
                textTransform: 'uppercase',
              }}
            >
              Advance to Week 15
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--fg3)',
                marginTop: 4,
              }}
            >
              Week 14 completes Sunday 11:59 PM ET. New matchups will be created
              automatically once results are finalized.
            </div>
          </div>
          <button className="ls-btn ls-btn-gold">
            <CI.ArrowRight size={12} />
            Advance Week
          </button>
        </div>
      </Accord>

      <Accord
        id="draft"
        title="Draft Settings"
        icon={
          isFootball ? (
            <CI.Football
              size={18}
              style={{ color: 'var(--brand-gold-light)' }}
            />
          ) : (
            <CI.Baseball
              size={18}
              style={{ color: 'var(--brand-gold-light)' }}
            />
          )
        }
        openId={open}
        setOpenId={setOpen}
      >
        <div className="ls-field-grid">
          <div className="ls-field">
            <label>Player Pool</label>
            <select className="ls-select">
              {isFootball ? (
                <>
                  <option>All NFL History (1920 – Present)</option>
                  <option>Hall of Fame Only</option>
                  <option>Super Bowl Era (1966 – Present)</option>
                  <option>Custom Era Range</option>
                </>
              ) : (
                <>
                  <option>All MLB History (1876 – Present)</option>
                  <option>Hall of Fame Only</option>
                  <option>Custom Era Range</option>
                </>
              )}
            </select>
          </div>
          <div className="ls-field">
            <label>Era Filter</label>
            <select className="ls-select">
              {isFootball ? (
                <>
                  <option>All Eras</option>
                  <option>Single-Wing (1920–1932)</option>
                  <option>T-Formation (1933–1969)</option>
                  <option>Modern Pro (1970–1999)</option>
                  <option>Spread Era (2000–Present)</option>
                </>
              ) : (
                <>
                  <option>All Eras</option>
                  <option>Dead Ball (1901–1919)</option>
                  <option>Live Ball (1920–1941)</option>
                  <option>Integration (1947–1968)</option>
                  <option>Modern (1969–Present)</option>
                </>
              )}
            </select>
          </div>
        </div>
        <Toggle
          on={true}
          onChange={() => {}}
          label="Snake draft order"
          hint="Reverse order each round · Standard snake draft"
        />
        <Toggle
          on={false}
          onChange={() => {}}
          label="Auto-draft on timeout"
          hint="Pick the top available player if a manager misses their window"
        />
      </Accord>

      <Accord
        id="order"
        title="Draft Pick Order"
        icon={<CI.Users size={18} />}
        openId={open}
        setOpenId={setOpen}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <div className="meta">Drag to reorder · First pick on top</div>
          <button className="ls-btn ls-btn-ghost sm">
            <CI.Zap size={11} />
            Randomize
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {window.TEAMS.slice()
            .reverse()
            .map((t, i) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 12px',
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--outline-subtle)',
                  borderRadius: 'var(--radius-3)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: 16,
                    color: 'var(--brand-gold-light)',
                    width: 28,
                  }}
                >
                  {i + 1}
                </span>
                <div className={`ls-avatar sm ${t.color}`}>{t.mgrInitials}</div>
                <span
                  style={{
                    flex: 1,
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    color: 'var(--fg1)',
                  }}
                >
                  {t.name}
                </span>
                <span className="meta mono" style={{ fontSize: 11 }}>
                  {t.mgr}
                </span>
                <button className="ls-icon-mini">
                  <CI.MoreVertical size={14} />
                </button>
              </div>
            ))}
        </div>
      </Accord>

      <Accord
        id="brand"
        title="League Branding"
        icon={<CI.Palette size={18} />}
        openId={open}
        setOpenId={setOpen}
      >
        <div className="ls-field-grid">
          <div className="ls-field">
            <label>League Name</label>
            <input
              className="ls-input ls-input-text"
              defaultValue={league.name}
            />
          </div>
          <div className="ls-field">
            <label>Invite Code</label>
            <input className="ls-input" defaultValue={league.inviteCode} />
          </div>
        </div>
        <div className="ls-field">
          <label>League Description</label>
          <textarea
            className="ls-input ls-input-text"
            rows={3}
            style={{ fontFamily: 'var(--font-body)', resize: 'vertical' }}
            defaultValue={
              isFootball
                ? 'Year-round dynasty league with all-time NFL history. Draft legends from every era and compete on archived game-by-game stats.'
                : 'Year-round dynasty league with all-time MLB history. Draft legends from every era and compete on archived statistics.'
            }
          />
        </div>
      </Accord>

      <Accord
        id="league"
        title="League Settings"
        icon={<CI.Settings size={18} />}
        openId={open}
        setOpenId={setOpen}
      >
        <div className="ls-field-grid">
          {isFootball ? FB_LEAGUE_FIELDS : BB_LEAGUE_FIELDS}
          <div className="ls-field">
            <label>Total Matchups</label>
            <input className="ls-input" defaultValue={league.totalMatchups} />
          </div>
          <div className="ls-field">
            <label>Playoff Format</label>
            <select className="ls-select" disabled={!playoffEnabled}>
              <option>4 Team Bracket</option>
              <option>6 Team Bracket</option>
              <option>8 Team Bracket</option>
            </select>
          </div>
        </div>
        <Toggle
          on={playoffEnabled}
          onChange={setPlayoffEnabled}
          label="Enable playoffs"
          hint="Top seeds qualify based on final regular-season standings"
        />
        <Toggle
          on={multiWeek}
          onChange={setMultiWeek}
          label="Multi-week playoff rounds"
          hint="Each playoff round spans 2 weeks for stats stability"
        />
      </Accord>

      <Accord
        id="dues"
        title="League Dues"
        icon={<CI.Dollar size={18} />}
        tint="gold"
        openId={open}
        setOpenId={setOpen}
        badge={
          <span className="meta" style={{ fontSize: 11, marginLeft: 8 }}>
            9 paid · 3 pending
          </span>
        }
      >
        <div className="ls-field-grid">
          <div className="ls-field">
            <label>Amount per Team</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  color: 'var(--fg3)',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                }}
              >
                $
              </span>
              <input
                className="ls-input"
                defaultValue="50"
                style={{ flex: 1 }}
              />
            </div>
          </div>
          <div className="ls-field">
            <label>Due Date</label>
            <input className="ls-input" defaultValue="April 15, 2026" />
          </div>
        </div>
        <div style={{ maxHeight: 200, overflowY: 'auto', paddingRight: 6 }}>
          {window.DUES.map((d) => (
            <div className="ls-dues-row" key={d.team}>
              <span style={{ color: 'var(--fg1)' }}>{d.team}</span>
              {d.status === 'paid' ? (
                <span className="status paid">
                  <CI.Check size={11} />
                  Paid · {d.paidOn}
                </span>
              ) : (
                <span className="status pending">
                  <CI.Clock size={11} />
                  Pending ·{' '}
                  <button
                    style={{
                      background: 'none',
                      border: 0,
                      color: 'var(--brand-gold-light)',
                      fontSize: 10,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Remind
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      </Accord>

      <Accord
        id="tie"
        title="Tiebreaker Rules"
        icon={<CI.Gavel size={18} />}
        openId={open}
        setOpenId={setOpen}
      >
        <div className="ls-field-grid">
          <div className="ls-field">
            <label>Primary</label>
            <select className="ls-select" defaultValue="h2h">
              <option value="h2h">Head-to-Head Record</option>
              <option>Points For</option>
              <option>Strength of Schedule</option>
            </select>
          </div>
          <div className="ls-field">
            <label>Secondary</label>
            <select className="ls-select" defaultValue="pf">
              <option value="pf">Points For</option>
              <option>Points Against</option>
              <option>Strength of Schedule</option>
            </select>
          </div>
          <div className="ls-field">
            <label>Tertiary</label>
            <select className="ls-select" defaultValue="sos">
              <option value="sos">Strength of Schedule</option>
              <option>Coin Flip</option>
            </select>
          </div>
        </div>
      </Accord>

      <Accord
        id="awards"
        title="Season Awards"
        icon={<CI.Award size={18} />}
        openId={open}
        setOpenId={setOpen}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--fg1)',
              }}
            >
              Voting Period
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--fg3)',
                marginTop: 2,
              }}
            >
              April 14 – April 22, 2026
            </div>
          </div>
          <button className="ls-btn ls-btn-ghost sm">
            <CI.Lock size={11} />
            Close Voting
          </button>
        </div>
        {window.AWARDS.map((a) => (
          <div key={a.id} style={{ marginBottom: 12 }}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: 'var(--brand-gold-light)',
                marginBottom: 6,
              }}
            >
              {a.label}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--fg2)',
              }}
            >
              Candidates: {a.candidates.join(' · ')}
            </div>
          </div>
        ))}
      </Accord>

      <Accord
        id="achieve"
        title="Achievement Restrictions"
        icon={<CI.Star size={18} />}
        openId={open}
        setOpenId={setOpen}
      >
        <Toggle on={true} onChange={() => {}} label="Enable achievements" />
        <Toggle
          on={true}
          onChange={() => {}}
          label="Perfect Record achievements"
        />
        <Toggle
          on={false}
          onChange={() => {}}
          label="Single-game milestone achievements"
          hint="Awards for single-game stat milestones (e.g. 4-HR game)"
        />
      </Accord>

      <Accord
        id="waiver"
        title="Waiver Processing"
        icon={<CI.Zap size={18} />}
        openId={open}
        setOpenId={setOpen}
      >
        <div className="ls-field-grid">
          <div className="ls-field">
            <label>Waiver Period</label>
            <select className="ls-select">
              <option>24 hours</option>
              <option>48 hours</option>
              <option>72 hours</option>
            </select>
          </div>
          <div className="ls-field">
            <label>Processing Day</label>
            <select className="ls-select">
              <option>Wednesday 3:00 AM ET</option>
              <option>Thursday 3:00 AM ET</option>
            </select>
          </div>
        </div>
        <Toggle
          on={faab}
          onChange={setFaab}
          label="Use FAAB (Free Agent Auction Budget)"
          hint="Managers bid dollars instead of using waiver priority"
        />
        {faab && (
          <div className="ls-field">
            <label>Starting FAAB Budget</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  color: 'var(--fg3)',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                }}
              >
                $
              </span>
              <input
                className="ls-input"
                defaultValue="100"
                style={{ width: 120 }}
              />
            </div>
          </div>
        )}
      </Accord>

      <Accord
        id="score"
        title="Scoring Editor"
        icon={<CI.TrendingUp size={18} />}
        openId={open}
        setOpenId={setOpen}
      >
        <div className="ls-scoring-grid">
          {sections.map((s) => (
            <div key={s.id} className="ls-scoring-col">
              <h5>{s.title}</h5>
              {(window.SCORING_RULES[s.id] || []).map((r) => (
                <div className="ls-scoring-row" key={r.stat}>
                  <span className="stat">{r.stat}</span>
                  <input
                    className="ls-input mono"
                    style={{
                      width: 64,
                      padding: '4px 8px',
                      fontSize: 12,
                      textAlign: 'right',
                    }}
                    defaultValue={r.val}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 14,
            justifyContent: 'flex-end',
          }}
        >
          <button className="ls-btn ls-btn-ghost sm">Reset to Defaults</button>
          <button className="ls-btn ls-btn-gold sm">
            <CI.Check size={11} />
            Save Scoring
          </button>
        </div>
      </Accord>

      <Accord
        id="new"
        title="New Season"
        icon={<CI.Plus size={18} />}
        openId={open}
        setOpenId={setOpen}
      >
        <div style={{ padding: '12px 0' }}>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: 'var(--fg1)',
              lineHeight: 1.5,
            }}
          >
            Ready to wrap up Season 2026 and start fresh? We'll freeze current
            standings, carry over your league settings, and create next season
            with the same 12 managers.
          </div>
          <button className="ls-btn ls-btn-gold" style={{ marginTop: 14 }}>
            <CI.ArrowRight size={12} />
            Create Next Season
          </button>
        </div>
      </Accord>

      <Accord
        id="danger"
        title="Danger Zone"
        icon={<CI.AlertTriangle size={18} style={{ color: '#E63950' }} />}
        tint="red"
        openId={open}
        setOpenId={setOpen}
      >
        <div
          style={{
            padding: '12px 14px',
            background: 'rgba(196,30,58,.08)',
            border: '1px solid rgba(196,30,58,.25)',
            borderRadius: 'var(--radius-3)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: '#E63950',
              marginBottom: 6,
            }}
          >
            Delete League
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--fg2)',
              lineHeight: 1.5,
            }}
          >
            Permanently remove {league.name}, all its rosters, matchups, and
            history. This cannot be undone.
          </div>
          {!confirm ? (
            <button
              className="ls-btn ls-btn-danger"
              style={{ marginTop: 14 }}
              onClick={() => setConfirm(true)}
            >
              <CI.AlertTriangle size={12} />
              Delete League
            </button>
          ) : (
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 14,
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: '#E63950',
                }}
              >
                Are you absolutely sure?
              </span>
              <button className="ls-btn ls-btn-danger sm">
                Yes, delete forever
              </button>
              <button
                className="ls-btn ls-btn-ghost sm"
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </Accord>
    </div>
  );
};

Object.assign(window, { TabCommish });
