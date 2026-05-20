// TabStandings.jsx — Full standings table + playoff bracket display.

const { Icons: SI, Section: SSection, Rank: SRank } = window;

const PlayoffBracket = ({ bracket }) => (
  <div className="ls-bracket">
    <div className="ls-bracket-col">
      <div className="ls-bracket-round">Semifinals</div>
      {bracket.semis.map((m, i) => (
        <div className="ls-bracket-match" key={i}>
          {m.teams.map((t, j) => (
            <div
              key={j}
              className={`ls-bracket-team ${m.winner === j ? 'winner' : ''}`}
            >
              <div className="name">
                <SRank n={m.seeds[j]} />
                {t}
              </div>
              <div className="sc">{m.scores[j].toFixed(1)}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
    <div className="ls-bracket-col final">
      <div
        className="ls-bracket-round"
        style={{ color: 'var(--brand-gold-light)', textAlign: 'center' }}
      >
        Championship
      </div>
      <div className="ls-bracket-match champ">
        {bracket.final.teams.map((t, j) => (
          <div
            key={j}
            className={`ls-bracket-team ${bracket.final.winner === j ? 'winner' : ''}`}
          >
            <div className="name">
              {bracket.final.winner === j && (
                <SI.Trophy
                  size={14}
                  style={{ color: 'var(--brand-gold-light)' }}
                />
              )}
              {t}
            </div>
            <div className="sc">{bracket.final.scores[j].toFixed(1)}</div>
          </div>
        ))}
      </div>
    </div>
    <div className="ls-bracket-col" style={{ justifyContent: 'center' }}>
      <div
        style={{
          textAlign: 'center',
          padding: '18px 16px',
          background: 'rgba(197,165,90,.07)',
          border: '1px solid rgba(197,165,90,.25)',
          borderRadius: 'var(--radius-4)',
        }}
      >
        <div style={{ color: 'var(--brand-gold-light)', marginBottom: 8 }}>
          <SI.Trophy size={32} />
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--brand-gold-light)',
          }}
        >
          Champion
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 22,
            color: 'var(--fg1-strong)',
            marginTop: 6,
          }}
        >
          {bracket.final.teams[bracket.final.winner]}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--fg3)',
            marginTop: 4,
          }}
        >
          Week {22} · Crowned
        </div>
      </div>
    </div>
  </div>
);

const TabStandings = ({ league, onTeam }) => {
  const teams = window.TEAMS;
  const myId = window.MY_TEAM_ID;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SSection
        title="League Standings"
        sub={`${teams.length} teams · Week ${league.currentWeek} of ${league.totalMatchups}`}
        right={
          <span className="meta">
            Sorted by Win % · Click row for team roster
          </span>
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
                <th className="num">Streak</th>
                <th className="num">Waiver</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => {
                const gp = t.w + t.l + t.t;
                const pct = ((t.w + t.t * 0.5) / gp)
                  .toFixed(3)
                  .replace(/^0/, '');
                return (
                  <tr
                    key={t.id}
                    className={t.id === myId ? 'me' : ''}
                    onClick={() => onTeam(t.id)}
                  >
                    <td>
                      <SRank n={t.rank} />
                    </td>
                    <td>
                      <div className="ls-team-cell">
                        <div className={`ls-avatar sm ${t.color}`}>
                          {t.mgrInitials}
                        </div>
                        <div>
                          <div className="name">
                            {t.name}
                            {t.id === myId && (
                              <span
                                className="ls-chip ls-chip-commish"
                                style={{
                                  marginLeft: 8,
                                  fontSize: 8,
                                  padding: '2px 6px',
                                }}
                              >
                                You
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: 12,
                              color: 'var(--fg4)',
                            }}
                          >
                            {t.mgr}
                            {t.online && (
                              <span style={{ color: '#22C55E', marginLeft: 6 }}>
                                ● online
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="num">{t.w}</td>
                    <td className="num">{t.l}</td>
                    <td className="num">{t.t}</td>
                    <td
                      className="num"
                      style={{ color: 'var(--fg1-strong)', fontWeight: 600 }}
                    >
                      {pct}
                    </td>
                    <td className="num">{t.pf.toFixed(1)}</td>
                    <td className="num">{t.pa.toFixed(1)}</td>
                    <td className="num">
                      <span
                        style={{
                          color: t.streak.startsWith('W')
                            ? '#22C55E'
                            : '#E63950',
                          fontWeight: 600,
                        }}
                      >
                        {t.streak}
                      </span>
                    </td>
                    <td className="num" style={{ color: 'var(--fg3)' }}>
                      {13 - t.rank + 1}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SSection>

      {league.playoffEnabled && (
        <SSection
          title="Playoff Bracket"
          sub="Top 4 seeds qualify · Semifinals Week 19-20 · Championship Week 21-22"
          right={
            <span className="ls-chip ls-chip-pre">
              <SI.Trophy size={10} />
              Upcoming
            </span>
          }
        >
          <PlayoffBracket bracket={window.PLAYOFF_BRACKET} />
        </SSection>
      )}
    </div>
  );
};

Object.assign(window, { TabStandings });
