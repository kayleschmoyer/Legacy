import React, { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { LeagueScoringSummary } from '@legacy-sports/shared-components/leagues';
import {
  type LeagueFragment,
  Sport,
  type TeamFragment,
  type TeamMemberFragment,
  useGetLeagueDuesStatusQuery,
  useGetLeagueStandingsQuery,
} from '../../../../api/db/graphql.generated';
import { CommissionerAnnouncementsPanel } from '../../../../features/baseball/CommissionerAnnouncementsPanel';
import { LeagueActivityFeed } from '../../../../features/baseball/LeagueActivityFeed';
import { LeagueChatTab } from '../../../../features/baseball/LeagueChatTab';
import { useLeagueScoringSettings } from '../../../../lib/scoring';
import { I } from '../Icons';
import {
  Banner,
  colorFromString,
  initialsFromName,
  Rank,
  Section,
} from '../Shared';
import type { TabId } from '../TabBar';

type SubTab = 'activity' | 'chat' | 'scoring';

interface RankedTeam {
  rank: number;
  teamId: number | null;
  name: string;
  primaryColor?: string | null;
  record: string;
  isMine: boolean;
}

export const Snapshot: React.FC<{
  teamCount: number;
  rosterSize: number;
  gamesPerMatchup: number;
  matchupDays: number;
  startersCount: number;
  isFootball: boolean;
}> = ({
  teamCount,
  rosterSize,
  gamesPerMatchup,
  matchupDays,
  startersCount,
  isFootball,
}) => (
  <div className="ls-snapshot">
    {[
      { label: 'Teams', value: String(teamCount) },
      { label: 'Roster Size', value: String(rosterSize) },
      isFootball
        ? { label: 'Weeks / Season', value: String(gamesPerMatchup) }
        : { label: 'Games / Matchup', value: String(gamesPerMatchup) },
      isFootball
        ? { label: 'Weekly Format', value: 'Head-to-Head' }
        : {
            label: 'Matchup Length',
            value: String(matchupDays),
            unit: 'days',
          },
      { label: 'My Starters', value: String(startersCount) },
    ].map((s) => (
      <div key={s.label} className="ls-snap-stat">
        <div className="label">{s.label}</div>
        <div className="value">
          {s.value}
          {'unit' in s && s.unit ? (
            <span className="unit">{s.unit}</span>
          ) : null}
        </div>
      </div>
    ))}
  </div>
);

const QuickStandings: React.FC<{
  ranked: readonly RankedTeam[];
  onTeam: (teamId: number) => void;
  onViewAll: () => void;
  weekNumber?: number | null;
}> = ({ ranked, onTeam, onViewAll, weekNumber }) => (
  <Section
    title="Standings"
    sub={`Top ${Math.min(6, ranked.length)}${weekNumber ? ` · Week ${weekNumber}` : ''}`}
    right={
      <button
        className="ls-btn ls-btn-ghost sm"
        onClick={onViewAll}
        type="button"
      >
        View <I.ArrowRight size={11} />
      </button>
    }
  >
    <div className="ls-qstandings">
      {ranked.slice(0, 6).map((row) => (
        <div
          key={row.teamId ?? row.rank}
          className={`ls-qstandings-row ${row.isMine ? 'me' : ''}`}
          onClick={() => row.teamId != null && onTeam(row.teamId)}
        >
          <Rank n={row.rank} />
          <div
            className={`ls-avatar sm ${colorFromString(row.name)}`}
            style={
              row.primaryColor ? { background: row.primaryColor } : undefined
            }
          >
            {initialsFromName(row.name)}
          </div>
          <div className="ls-qstandings-name">{row.name}</div>
          <div className="ls-qstandings-record mono">{row.record}</div>
        </div>
      ))}
    </div>
    {ranked.length > 6 ? (
      <div
        style={{
          textAlign: 'center',
          paddingTop: 8,
          fontSize: 12,
          color: 'var(--fg4)',
        }}
      >
        + {ranked.length - 6} more teams
      </div>
    ) : null}
  </Section>
);

export const DuesCompact: React.FC<{ leagueId: number }> = ({ leagueId }) => {
  const { data } = useGetLeagueDuesStatusQuery({
    variables: { leagueId },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });
  const settings = data?.leagueDuesSettings;
  const members = data?.leagueDuesStatus ?? [];
  if (!settings?.enabled || members.length === 0) return null;
  const amountCents = settings.amountCents ?? 0;
  const amountDollars = (amountCents / 100).toFixed(2);
  const paid = members.filter((m) => m.paid).length;
  const total = members.length;
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
  const collectedDollars = ((paid * amountCents) / 100).toFixed(2);
  const pending = members.filter((m) => !m.paid);
  return (
    <Section
      title="League Dues"
      sub={`$${amountDollars} per team`}
      right={
        <span className="ls-chip ls-chip-pre">
          <I.Dollar size={10} /> Enabled
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
          teams paid · ${collectedDollars} collected
        </div>
      </div>
      <div className="ls-progress" style={{ marginBottom: 12 }}>
        <div className="ls-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {pending.length > 0 ? (
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
          {pending.map((m) => (
            <div className="ls-dues-row" key={m.userId ?? m.username}>
              <span style={{ color: 'var(--fg1)' }}>
                {m.username ?? `User ${m.userId ?? ''}`}
              </span>
              <span className="status pending">
                <I.Clock size={11} /> Pending
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </Section>
  );
};

const InviteCard: React.FC<{ league: LeagueFragment }> = ({ league }) => {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const [showQr, setShowQr] = useState(false);
  const inviteUrl = league.inviteCode
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/baseball/league/join/${league.inviteCode}`
    : '';
  const copy = (what: 'link' | 'code', text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => undefined);
    }
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };
  const inviteReady = Boolean(league.inviteCode);
  return (
    <Section title="Invite Friends" sub="Share your league with new managers.">
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
            <input readOnly value={inviteUrl} />
            <button
              type="button"
              aria-label="Copy invite link"
              className={`ls-copy-btn ${copied === 'link' ? 'ok' : ''}`}
              onClick={() => copy('link', inviteUrl)}
            >
              {copied === 'link' ? (
                <>
                  <I.Check size={11} /> Copied
                </>
              ) : (
                <>
                  <I.Copy size={11} /> Copy
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
            <input readOnly value={league.inviteCode ?? ''} />
            <button
              type="button"
              aria-label="Copy invite code"
              className={`ls-copy-btn ${copied === 'code' ? 'ok' : ''}`}
              onClick={() => copy('code', league.inviteCode ?? '')}
            >
              {copied === 'code' ? (
                <>
                  <I.Check size={11} /> Copied
                </>
              ) : (
                <>
                  <I.Copy size={11} /> Copy
                </>
              )}
            </button>
          </div>
        </div>
        {copied && (
          <div
            role="status"
            style={{ fontSize: 12, color: 'var(--fg-ok, #6fd39a)' }}
          >
            {copied === 'link' ? 'Invite link copied' : 'Invite code copied'}
          </div>
        )}
        <button
          type="button"
          className="ls-btn ls-btn-gold block"
          onClick={() => setShowQr((v) => !v)}
        >
          <I.QrCode size={12} /> {showQr ? 'Hide' : 'Show'} QR Code to Invite
        </button>
        {showQr ? (
          inviteReady ? (
            <div className="ls-qr-wrap" data-testid="qr-code-svg">
              <QRCodeSVG value={inviteUrl} size={180} level="M" includeMargin />
            </div>
          ) : (
            <div
              className="ls-qr-wrap"
              data-testid="qr-code-skeleton"
              role="status"
              aria-label="Loading QR code"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 196,
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 180,
                  height: 180,
                  background:
                    'linear-gradient(90deg, var(--bg2, #1a2433) 0%, var(--bg3, #243040) 50%, var(--bg2, #1a2433) 100%)',
                  backgroundSize: '200% 100%',
                  borderRadius: 8,
                  animation: 'ls-shimmer 1.4s linear infinite',
                }}
              />
            </div>
          )
        ) : null}
      </div>
    </Section>
  );
};

export interface OverviewTabProps {
  league: LeagueFragment;
  teams: readonly TeamFragment[];
  myTeamId: number | null;
  isCommissioner: boolean;
  onTab: (t: TabId) => void;
  onTeam: (teamId: number) => void;
  currentUserId: number | null;
  myRoster: readonly TeamMemberFragment[];
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  league,
  teams,
  myTeamId,
  isCommissioner,
  onTab,
  onTeam,
  currentUserId,
  myRoster,
}) => {
  const [sub, setSub] = useState<SubTab>('activity');

  const { data: standingsData } = useGetLeagueStandingsQuery({
    variables: { leagueId: league.id ?? 0 },
    skip: !league.id,
    errorPolicy: 'all',
  });

  const ranked = useMemo<RankedTeam[]>(() => {
    const rows = standingsData?.getLeagueStandings ?? [];
    if (rows.length > 0) {
      const formatRecord = (
        w: number | null | undefined,
        l: number | null | undefined,
        t: number | null | undefined,
      ) => {
        const wn = w ?? 0;
        const ln = l ?? 0;
        const tn = t ?? 0;
        return tn > 0 ? `${wn}-${ln}-${tn}` : `${wn}-${ln}`;
      };
      return [...rows]
        .sort((a, b) => {
          const aw = a.winPercentage ?? -1;
          const bw = b.winPercentage ?? -1;
          if (aw !== bw) return bw - aw;
          return (b.pointsFor ?? 0) - (a.pointsFor ?? 0);
        })
        .map((s, idx) => {
          const teamId = s.teamId ? Number(s.teamId) : null;
          return {
            rank: idx + 1,
            teamId,
            name: s.teamName ?? 'Team',
            primaryColor: s.primaryColor ?? null,
            record: formatRecord(s.wins, s.losses, s.ties),
            isMine: teamId != null && teamId === myTeamId,
          };
        });
    }
    return teams
      .filter((t) => t.id != null)
      .map((t, idx) => ({
        rank: idx + 1,
        teamId: t.id ?? null,
        name: t.name ?? 'Team',
        primaryColor: t.primaryColor ?? null,
        record: '—',
        isMine: t.id != null && t.id === myTeamId,
      }));
  }, [standingsData, teams, myTeamId]);

  const draftStatus = league.draftStatus ?? 'pre-draft';
  const isDrafting =
    draftStatus === 'in-progress' || draftStatus === 'drafting';

  const isFootball = league.sport === Sport.Football;
  const startersCount = myRoster.filter((p) => p.positionId != null).length;

  const mentionableTeams = useMemo(
    () =>
      teams
        .filter((t): t is TeamFragment & { id: number } => t.id != null)
        .map((t) => ({ id: t.id, name: t.name ?? 'Team' })),
    [teams],
  );

  const scoring = useLeagueScoringSettings(league.id ?? undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {isDrafting ? (
        <Banner
          kind="live"
          icon={<I.Zap size={20} />}
          title="Draft Is Live"
          sub="Join the draft room to make your picks."
          actions={
            <button
              className="ls-btn ls-btn-seam sm"
              type="button"
              onClick={() => onTab('overview')}
            >
              <I.PlayCircle size={12} /> Join Draft Room
            </button>
          }
        />
      ) : null}
      {isCommissioner && league.lmNotes ? (
        <Banner
          kind="gold"
          icon={<I.Bell size={20} />}
          title="Commissioner Announcement"
          sub={league.lmNotes}
        />
      ) : null}

      {/* Commissioner Announcements panel — mirrors legacy LeagueDetailPage,
          where every member could see announcements on the overview. The
          panel itself hides when there are no announcements and the viewer
          is not the commissioner. */}
      {league.id != null ? (
        <CommissionerAnnouncementsPanel
          leagueId={league.id}
          isCommissioner={isCommissioner}
        />
      ) : null}

      <Snapshot
        teamCount={teams.length}
        rosterSize={league.maxRosterSize ?? 0}
        gamesPerMatchup={league.gamesPerMatchup ?? 0}
        matchupDays={7}
        startersCount={startersCount}
        isFootball={isFootball}
      />

      <div className="ls-overview-grid">
        <div className="ls-overview-main">
          <Section
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
                  ? `Real-time · ${teams.length} managers`
                  : 'How points are calculated'
            }
            right={
              <div className="ls-subtabs" role="tablist">
                {(['activity', 'chat', 'scoring'] as SubTab[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="tab"
                    aria-selected={sub === s}
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
            {sub === 'activity' && league.id != null ? (
              <LeagueActivityFeed
                leagueId={league.id}
                draftStatus={draftStatus}
                currentMatchup={league.currentMatchup ?? null}
                teamCount={teams.length}
              />
            ) : null}
            {sub === 'chat' && league.id != null ? (
              <LeagueChatTab
                leagueId={league.id}
                userId={currentUserId ?? 0}
                mentionableTeams={mentionableTeams}
              />
            ) : null}
            {sub === 'scoring' && league.id != null ? (
              <LeagueScoringSummary
                loading={scoring.loading}
                error={scoring.error ?? null}
                profileName={scoring.profileName}
                settings={scoring.settings}
              />
            ) : null}
          </Section>
        </div>

        <div className="ls-overview-side">
          <QuickStandings
            ranked={ranked}
            onTeam={onTeam}
            onViewAll={() => onTab('standings')}
            weekNumber={league.currentWeekNumber}
          />
          {league.id != null ? <DuesCompact leagueId={league.id} /> : null}
          {isCommissioner ? <InviteCard league={league} /> : null}
        </div>
      </div>
    </div>
  );
};
