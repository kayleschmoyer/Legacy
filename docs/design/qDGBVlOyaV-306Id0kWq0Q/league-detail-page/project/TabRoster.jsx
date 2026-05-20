// TabRoster.jsx — My Roster management, with week selector, pending actions + editable lineup.
// Lineup is split into position groups (hitters/pitchers for baseball, offense/defense/special teams for football)
// for both the starting lineup and the bench.

const {
  Icons: RI,
  Section: RSection,
  Banner: RBanner,
  PlayerRow: RPlayerRow,
} = window;

// Map posClass -> group key per sport.
const POS_GROUPS = {
  baseball: {
    hitters: {
      label: 'Hitters',
      classes: ['catcher', 'infield', 'outfield', 'utility'],
    },
    pitchers: { label: 'Pitchers', classes: ['pitcher'] },
  },
  football: {
    offense: { label: 'Offense', classes: ['qb', 'rb', 'wr', 'te', 'flex'] },
    defense: { label: 'Defense', classes: ['def'] },
    special: { label: 'Special Teams', classes: ['k'] },
  },
};

const groupRoster = (players, sport) => {
  const groups = POS_GROUPS[sport] || POS_GROUPS.baseball;
  const out = {};
  for (const key of Object.keys(groups))
    out[key] = { ...groups[key], players: [] };
  for (const p of players) {
    for (const key of Object.keys(groups)) {
      if (groups[key].classes.includes(p.posClass)) {
        out[key].players.push(p);
        break;
      }
    }
  }
  // Drop empty groups.
  return Object.entries(out).filter(([, g]) => g.players.length > 0);
};

const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);

const TabRoster = ({ league }) => {
  const [week, setWeek] = React.useState(league.currentWeek);
  const isPast = week < league.currentWeek;
  const isFuture = week > league.currentWeek;
  const isCurrent = week === league.currentWeek;
  const editable = !isPast;
  const sport = window.SPORT || 'baseball';
  const isFootball = sport === 'football';
  const oppName = isFootball ? 'Lambeau Leapers' : 'Motor City Tigers';
  const dateRange = isFootball ? 'Thu Nov 12 – Mon Nov 16' : 'Apr 14 – Apr 20';

  const starters = window.MY_ROSTER;
  const bench = window.MY_BENCH;

  const starterGroups = groupRoster(starters, sport);
  const benchGroups = groupRoster(bench, sport);

  const groupTotals = (players) => {
    const actual = players.reduce((s, p) => s + (p.actual || 0), 0);
    const proj = players.reduce((s, p) => s + (p.proj || 0), 0);
    return { actual, proj };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Week selector */}
      <div className="ls-week-nav">
        <div className="ls-week-nav-left">
          <button
            className="ls-navbtn"
            onClick={() => setWeek(Math.max(1, week - 1))}
            disabled={week === 1}
          >
            <RI.ChevronLeft size={16} />
          </button>
          <div>
            <div
              className="ls-week-title"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              Week {week}
              {isCurrent && (
                <span
                  className="ls-chip ls-chip-active"
                  style={{ fontSize: 9, padding: '3px 7px' }}
                >
                  Current
                </span>
              )}
              {isPast && (
                <span
                  className="ls-chip ls-chip-final"
                  style={{ fontSize: 9, padding: '3px 7px' }}
                >
                  Frozen
                </span>
              )}
              {isFuture && (
                <span
                  className="ls-chip ls-chip-pre"
                  style={{ fontSize: 9, padding: '3px 7px' }}
                >
                  Upcoming
                </span>
              )}
            </div>
            <div className="meta" style={{ fontSize: 12, marginTop: 2 }}>
              vs {oppName} · {dateRange}
            </div>
          </div>
          <button
            className="ls-navbtn"
            onClick={() => setWeek(Math.min(league.totalMatchups, week + 1))}
            disabled={week === league.totalMatchups}
          >
            <RI.ChevronRight size={16} />
          </button>
        </div>
        {!isCurrent && (
          <button
            className="ls-btn ls-btn-ghost sm"
            onClick={() => setWeek(league.currentWeek)}
          >
            Reset to Current
          </button>
        )}
      </div>

      {isPast && (
        <RBanner
          kind="info"
          icon={<RI.Lock size={18} />}
          title="Historical Mode"
          sub="This matchup is finalized. Lineup changes are locked for past weeks."
        />
      )}
      {isFuture && (
        <RBanner
          kind="warning"
          icon={<RI.Info size={18} />}
          title="Future Week — Provisional Lineup"
          sub="Changes you make will apply to this week and all future matchups until updated again."
        />
      )}

      {isCurrent && (
        <>
          <RBanner
            kind="gold"
            icon={<RI.Zap size={18} />}
            title="Pending Waiver Claim"
            sub={
              isFootball
                ? 'Add "Cooper Kupp" (WR, LAR 2021) · Drop "Calvin Johnson" · Processes Wed 3:00 AM'
                : 'Add "Willie Mays" (OF, SF 1954) · Drop "Ken Griffey Jr." · Processes Wed 3:00 AM'
            }
            actions={
              <>
                <button className="ls-btn ls-btn-ghost sm">Edit</button>
                <button className="ls-btn ls-btn-ghost sm">
                  <RI.X size={12} />
                  Cancel
                </button>
              </>
            }
          />
          <RBanner
            kind="info"
            icon={<RI.ArrowLeftRight size={18} />}
            title={
              isFootball
                ? 'Pending Trade Offer from Greatest Show'
                : 'Pending Trade Offer from Dead Ball Legends'
            }
            sub={
              isFootball
                ? 'They offer: Marshall Faulk · Isaac Bruce   →  You send: Calvin Johnson · 2026 R2 pick'
                : 'They offer: Walter Johnson · Nap Lajoie   →  You send: Randy Johnson · Mike Schmidt'
            }
            actions={
              <>
                <button className="ls-btn ls-btn-primary sm">
                  <RI.Check size={12} />
                  Review
                </button>
              </>
            }
          />
        </>
      )}

      <div className="ls-roster-editor">
        {/* Starting lineup — one section per position group. */}
        {starterGroups.map(([key, g]) => {
          const t = groupTotals(g.players);
          return (
            <RSection
              key={'start-' + key}
              title={`Starting ${g.label}`}
              sub={`${g.players.length} of ${g.players.length} positions filled`}
              right={
                <span className="meta mono">
                  Total:{' '}
                  <b style={{ color: 'var(--fg1-strong)' }}>{fmt(t.actual)}</b>{' '}
                  · Proj {fmt(t.proj)}
                </span>
              }
            >
              <div className="ls-roster-positions">
                {g.players.map((p, i) => (
                  <RPlayerRow key={i} p={p} editable={editable} />
                ))}
              </div>
            </RSection>
          );
        })}

        {/* Bench — one section per position group. */}
        {benchGroups.map(([key, g]) => {
          const t = groupTotals(g.players);
          return (
            <RSection
              key={'bench-' + key}
              title={`Bench ${g.label}`}
              sub={`${g.players.length} ${g.players.length === 1 ? 'player' : 'players'}`}
              right={
                editable && (
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                  >
                    {t.proj > 0 && (
                      <span className="meta mono">Proj {fmt(t.proj)}</span>
                    )}
                    <button className="ls-btn ls-btn-ghost sm">
                      <RI.Plus size={12} />
                      Add
                    </button>
                  </div>
                )
              }
            >
              <div className="ls-roster-positions">
                {g.players.map((p, i) => (
                  <RPlayerRow key={i} p={p} editable={editable} />
                ))}
              </div>
            </RSection>
          );
        })}

        <div
          style={{
            padding: '4px 4px',
            fontSize: 12,
            color: 'var(--fg4)',
            fontFamily: 'var(--font-body)',
            textAlign: 'center',
          }}
        >
          Tip: drag a bench player onto a slot in the same group, or tap the
          swap icon to move them in.
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { TabRoster });
