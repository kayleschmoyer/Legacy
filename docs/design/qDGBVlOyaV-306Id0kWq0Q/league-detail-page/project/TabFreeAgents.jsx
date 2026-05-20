// TabFreeAgents.jsx — Sport-aware free agents: groups + columns come from window.FREE_AGENTS bundle.

const { Icons: FI, Section: FSection } = window;

const POS_CLASS = (pos) => {
  // Baseball
  if (['C'].includes(pos)) return 'catcher';
  if (['1B', '2B', '3B', 'SS'].includes(pos)) return 'infield';
  if (['OF', 'DH'].includes(pos)) return 'outfield';
  if (['SP', 'RP'].includes(pos)) return 'pitcher';
  if (['UTIL'].includes(pos)) return 'utility';
  // Football
  if (pos === 'QB') return 'qb';
  if (pos === 'RB') return 'rb';
  if (pos === 'WR') return 'wr';
  if (pos === 'TE') return 'te';
  if (pos === 'K') return 'k';
  if (pos === 'DEF') return 'def';
  if (pos === 'FLEX') return 'flex';
  return 'utility';
};

const formatCell = (val, fmt) => {
  if (val === undefined || val === null) return '—';
  if (fmt === 'f1') return Number(val).toFixed(1);
  if (fmt === 'f2') return Number(val).toFixed(2);
  if (fmt === 'avg3') return Number(val).toFixed(3).replace(/^0/, '');
  if (fmt === 'pct3') return (Number(val) * 100).toFixed(1) + '%';
  return val;
};

const TabFreeAgents = ({ isMember }) => {
  const fa = window.FREE_AGENTS;
  const groups = fa.groups;
  const [groupKey, setGroupKey] = React.useState(groups[0].key);
  const [pos, setPos] = React.useState('All');
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    // Reset filters when sport switches and old group key isn't present
    if (!groups.find((g) => g.key === groupKey)) setGroupKey(groups[0].key);
  }, [groups]);

  React.useEffect(() => {
    setPos('All');
    setPage(1);
  }, [groupKey]);

  const group = groups.find((g) => g.key === groupKey) || groups[0];
  const base = group.data;
  const filtered = base.filter(
    (p) =>
      (pos === 'All' || p.pos === pos) &&
      (q === '' || p.name.toLowerCase().includes(q.toLowerCase())),
  );

  const isFootball = window.SPORT === 'football';
  const groupTabsScroll =
    groups.length > 2 ? { overflowX: 'auto', maxWidth: '100%' } : {};

  return (
    <FSection
      title="Free Agents"
      sub={
        isFootball
          ? 'Players not yet rostered in this league. Search all-time NFL talent.'
          : 'Players not yet rostered in this league. Search MLB history across all eras.'
      }
      right={
        <div className="ls-subtabs" style={groupTabsScroll}>
          {groups.map((g) => (
            <button
              key={g.key}
              className={groupKey === g.key ? 'on' : ''}
              onClick={() => setGroupKey(g.key)}
            >
              {g.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="ls-fa-controls">
        <div className="ls-search">
          <FI.Search size={16} />
          <input
            placeholder={`Search ${group.label.toLowerCase()} by name…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="ls-filter-pills">
          {(group.positions || ['All']).map((p) => (
            <button
              key={p}
              className={pos === p ? 'on' : ''}
              onClick={() => setPos(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="ls-table-wrap">
        <table className="ls-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Pos</th>
              {group.cols.map(([id, label]) => (
                <th key={id} className="num">
                  {label}
                </th>
              ))}
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={i}>
                <td>
                  <div className="ls-team-cell">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--fg1)' }}>
                        {p.name}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--fg4)',
                        }}
                      >
                        {p.team} · {p.era}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`ls-pchip ${POS_CLASS(p.pos)}`}>
                    {p.pos}
                  </span>
                </td>
                {group.cols.map(([id, label, fmt]) => (
                  <td key={id} className="num">
                    {formatCell(p[id], fmt)}
                  </td>
                ))}
                <td style={{ textAlign: 'right' }}>
                  {isMember ? (
                    <button className="ls-btn ls-btn-gold sm">
                      <FI.Plus size={11} />
                      Claim
                    </button>
                  ) : (
                    <button className="ls-btn ls-btn-ghost sm" disabled>
                      Spectator
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={group.cols.length + 3}
                  style={{
                    textAlign: 'center',
                    padding: 36,
                    color: 'var(--fg4)',
                  }}
                >
                  No free agents match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="ls-paginate">
          <span className="meta">
            {filtered.length} players · Page {page} of{' '}
            {Math.max(1, Math.ceil(filtered.length / 50))}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="ls-navbtn"
              onClick={() => setPage(Math.max(1, page - 1))}
            >
              <FI.ChevronLeft size={14} />
            </button>
            <button className="ls-navbtn" onClick={() => setPage(page + 1)}>
              <FI.ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </FSection>
  );
};

Object.assign(window, { TabFreeAgents });
