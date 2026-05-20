// TabHistory.jsx — Past seasons, standings + all-time records.

const { Icons: HI, Section: HSection, Rank: HRank } = window;

const TabHistory = () => {
  const [season, setSeason] = React.useState(window.PAST_SEASONS[0].year);
  const sc = window.SPORT_CONFIG || {};
  const champions = window.CHAMPIONS || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <HSection
        title="League History"
        sub={sc.leagueEstDescription || 'Past seasons + standings'}
        right={
          <select
            className="ls-select"
            value={season}
            onChange={(e) => setSeason(+e.target.value)}
          >
            {window.PAST_SEASONS.map((s) => (
              <option key={s.year} value={s.year}>
                {s.label}
              </option>
            ))}
          </select>
        }
      >
        <div className="ls-table-wrap">
          <table className="ls-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Rank</th>
                <th>Team</th>
                <th className="num">W</th>
                <th className="num">L</th>
                <th className="num">T</th>
                <th className="num">Win %</th>
                <th className="num">PF</th>
                <th className="num">PA</th>
              </tr>
            </thead>
            <tbody>
              {window.PAST_STANDINGS.map((t) => (
                <tr key={t.rank}>
                  <td>
                    <HRank n={t.rank} />
                  </td>
                  <td>
                    <div className="ls-team-cell">
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      {t.rank === 1 && (
                        <HI.Trophy
                          size={14}
                          style={{ color: 'var(--brand-gold-light)' }}
                        />
                      )}
                    </div>
                  </td>
                  <td className="num">{t.w}</td>
                  <td className="num">{t.l}</td>
                  <td className="num">{t.t}</td>
                  <td
                    className="num"
                    style={{ fontWeight: 600, color: 'var(--fg1-strong)' }}
                  >
                    {t.winpct.toFixed(3).replace(/^0/, '')}
                  </td>
                  <td className="num">{t.pf.toFixed(1)}</td>
                  <td className="num">{t.pa.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HSection>

      <HSection
        title="All-Time Records"
        sub={`Across all seasons of ${window.LEAGUE?.name || 'this league'}`}
      >
        <div className="ls-records-grid">
          {window.RECORDS.map((r, i) => (
            <div
              key={r.label}
              className={`ls-record-card ${i === 0 ? 'trophy' : ''}`}
            >
              <div className="ls-record-icon">
                {r.icon === 'zap' && <HI.Zap size={20} />}
                {r.icon === 'trophy' && <HI.Trophy size={20} />}
                {r.icon === 'trendingup' && <HI.TrendingUp size={20} />}
                {r.icon === 'flame' && <HI.Flame size={20} />}
              </div>
              <div className="ls-record-label">{r.label}</div>
              <div className="ls-record-value">{r.value}</div>
              <div className="ls-record-holder">{r.holder}</div>
              <div className="ls-record-date">{r.date}</div>
            </div>
          ))}
        </div>
      </HSection>

      <HSection title="Champions Row" sub="Previous season winners">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))',
            gap: 14,
          }}
        >
          {champions.map((c) => (
            <div
              key={c.year}
              style={{
                padding: 14,
                background:
                  'linear-gradient(135deg, rgba(197,165,90,0.08), var(--surface-card) 60%)',
                border: '1px solid rgba(197,165,90,.25)',
                borderRadius: 'var(--radius-4)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <div style={{ color: 'var(--brand-gold-light)' }}>
                  <HI.Trophy size={20} />
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: 18,
                    color: 'var(--brand-gold-light)',
                    letterSpacing: '.04em',
                  }}
                >
                  {c.year}
                </div>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 15,
                  color: 'var(--fg1-strong)',
                }}
              >
                {c.team}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--fg3)',
                  marginTop: 2,
                }}
              >
                {c.mgr}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--fg4)',
                  marginTop: 6,
                }}
              >
                Final: {c.score}
              </div>
            </div>
          ))}
        </div>
      </HSection>
    </div>
  );
};

Object.assign(window, { TabHistory });
