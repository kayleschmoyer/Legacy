import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { LOGGER } from '@legacy-sports/logging';
import './styles.css';
import { type LeagueRole, RoleBar } from './RoleBar';
import { LeagueHero } from './LeagueHero';
import { TAB_IDS, TabBar, type TabId } from './TabBar';
import { OverviewTab } from './tabs/Overview';
import { MatchupTab } from './tabs/Matchup';
import { RosterTab } from './tabs/Roster';
import { FreeAgentsTab } from './tabs/FreeAgents';
import { StandingsTab } from './tabs/Standings';
import { TradesTab } from './tabs/Trades';
import { HistoryTab } from './tabs/History';
import { TeamTab } from './tabs/Team';
import { CommishTab } from './tabs/Commish';
import { setUserTeamId } from '../../../store/leagueSlice';
import { useAppDispatch } from '../../../store/hooks';
import { PageMeta } from '../../../components/PageMeta';
import {
  type LeagueFragment,
  type TeamFragment,
  useGetLeagueByIdQuery,
  useGetLeagueTeamsLazyQuery,
  useGetTeamMembersQuery,
  useGetUserTeamIdLazyQuery,
} from '../../../api/db/graphql.generated';
import { useLeagueScoringSettings } from '../../../lib/scoring';
import { LeagueWebSocketContext } from '../../../context/LeagueWebSocketContext';
import { useLeagueWebSocket } from '../../../hooks/useLeagueWebSocket';
import { useLeagueWebSocketLifecycle } from '../../../hooks/useLeagueWebSocketLifecycle';

/** Subscribes to page-level WS events that need to refetch league-level data. */
function LeagueWSPageHandler({
  onDraftStarted,
}: {
  onDraftStarted: () => void;
}) {
  useLeagueWebSocket({ onDraftStarted });
  return null;
}

const ROLE_KEY = 'ls-v2-role';

// Backward-compatible URL mapping. Legacy LeagueDetailPage accepted these tab
// slugs in addition to V2's canonical IDs; preserved so old bookmarks and
// in-app links don't silently land on Overview.
const TAB_ALIASES: Record<string, TabId> = {
  info: 'overview',
  overview: 'overview',
  matchup: 'matchup',
  roster: 'roster',
  'free-agents': 'free-agents',
  standings: 'standings',
  trades: 'trades',
  history: 'history',
  team: 'team',
  'my-team': 'team',
  'team-settings': 'team',
  commish: 'commish',
  commissioner: 'commish',
};

export function LeagueDetailPageV2(): React.JSX.Element {
  const {
    id,
    tab: routeTab,
    matchupId: routeMatchupId,
  } = useParams<{
    id: string;
    tab?: string;
    matchupId?: string;
  }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { user, isLoading: authLoading, token: authToken } = useAuth();
  const leagueId = id ? parseInt(id, 10) : NaN;
  const isAuthenticated = !authLoading && !!user;

  const { client: wsClient, connected: wsConnected } =
    useLeagueWebSocketLifecycle({ leagueId, isAuthenticated, authToken });

  const {
    data: leagueData,
    previousData: leaguePreviousData,
    loading: leagueLoading,
    error: leagueError,
    refetch: refetchLeague,
  } = useGetLeagueByIdQuery({
    variables: { id: leagueId },
    skip: !Number.isFinite(leagueId),
  });
  // Fall back to previousData during refetches so CommishTab stays mounted and
  // in-flight success state (e.g. the "saved successfully" toast) isn't lost.
  const league = (leagueData?.league ?? leaguePreviousData?.league) as
    | LeagueFragment
    | null
    | undefined;

  const [getTeams, { data: teamsData }] = useGetLeagueTeamsLazyQuery();
  useEffect(() => {
    if (Number.isFinite(leagueId)) void getTeams({ variables: { leagueId } });
  }, [leagueId, getTeams]);
  const teams = (teamsData?.leagueTeams ?? []) as TeamFragment[];

  const [getUserTeamId, { data: userTeamData }] = useGetUserTeamIdLazyQuery();
  useEffect(() => {
    if (Number.isFinite(leagueId) && user?.id != null) {
      void getUserTeamId({ variables: { leagueId } });
    }
  }, [leagueId, user?.id, getUserTeamId]);
  const userTeamId = userTeamData?.userTeamId ?? undefined;

  useEffect(() => {
    if (userTeamData?.userTeamId !== undefined) {
      dispatch(setUserTeamId(userTeamData.userTeamId ?? null));
    }
  }, [userTeamData, dispatch]);

  const isCommissioner = !!(user && league?.owner === user.id);
  const isMember = isCommissioner || userTeamId != null;
  // True once we know the user's membership status: auth done AND either the
  // user is unauthenticated or the userTeamId query has returned at least once.
  // Used to block the tab-gate redirect and the roster/team render guards until
  // we have enough data to make the right decision (prevents Manager1 from being
  // bounced to /overview while the lazy userTeamId query is in-flight).
  const userTeamIdSettled =
    !authLoading && (!user?.id || userTeamData !== undefined);

  const { data: teamMembersData } = useGetTeamMembersQuery({
    variables: { teamId: userTeamId ?? 0 },
    skip: !userTeamId,
  });
  const myRoster = teamMembersData?.teamMembers ?? [];

  // Hero "scoring" label is the active league scoring profile's name,
  // surfaced via useLeagueScoringSettings. The hook already defaults to
  // 'Default' when no profile is loaded, so we surface that string as-is
  // rather than masking it with a hardcoded fallback.
  const { profileName: scoringProfileName } = useLeagueScoringSettings(
    league?.id ?? undefined,
  );

  // Commissioner-settings toast state lives at the page level — not inside
  // CommishTab — so a transient CommishTab unmount (e.g. isCommissioner briefly
  // flipping false during an Apollo cache refetch after the save mutation
  // lands) can't drop the "saved successfully" message before it renders.
  // LS-4193 → LS-4207 → LS-4216 → LS-4227 → LS-4236 → LS-4242 → LS-4249 →
  // LS-4314 → LS-4542 (this fix). LS-4249 deduplicated to a single role=status
  // in CommishTab; LS-4314 added previousData fallback to keep CommishTab
  // mounted across refetches; LS-4412 then re-introduced an unmount vector by
  // gating the render on isCommissioner. Lifting the state here makes the
  // toast resilient to any future CommishTab unmount cause.
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [storedRole, setStoredRole] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      return window.localStorage.getItem(ROLE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const role: LeagueRole = useMemo(() => {
    if (storedRole === 'commish' && isCommissioner) return 'commish';
    if (storedRole === 'member' && isMember) return 'member';
    if (storedRole === 'spectator') return 'spectator';
    return isCommissioner ? 'commish' : isMember ? 'member' : 'spectator';
  }, [isCommissioner, isMember, storedRole]);
  const setRole = useCallback((r: LeagueRole) => {
    setStoredRole(r);
    try {
      window.localStorage.setItem(ROLE_KEY, r);
    } catch (err: unknown) {
      // Pass the Error instance as a non-message arg so Rollbar / LogArgs
      // can extract the stack trace; never wrap it in `{ err }`.
      const errorArg = err instanceof Error ? err : new Error(String(err));
      LOGGER.debug('LeagueDetailV2: localStorage unavailable', errorArg);
    }
  }, []);

  const effIsCommish = role === 'commish' && isCommissioner;
  const effIsMember = effIsCommish || role === 'member';

  const tabFromRoute: TabId = useMemo(() => {
    if (!routeTab) return 'overview';
    const aliased = TAB_ALIASES[routeTab];
    if (aliased) return aliased;
    if ((TAB_IDS as readonly string[]).includes(routeTab))
      return routeTab as TabId;
    return 'overview';
  }, [routeTab]);

  // Replace unknown tab slugs in the URL with /overview so bookmarks to
  // invalid routes (or mistyped URLs) resolve cleanly without silently
  // rendering Overview content at a non-overview URL.  Uses replace so the
  // bogus slug never enters browser history and the back button works cleanly.
  useEffect(() => {
    if (!routeTab) return;
    const isKnown =
      routeTab in TAB_ALIASES ||
      (TAB_IDS as readonly string[]).includes(routeTab);
    if (!isKnown && Number.isFinite(leagueId)) {
      navigate(`/baseball/league/${leagueId}/overview`, { replace: true });
    }
  }, [routeTab, leagueId, navigate]);

  const [tab, setTabState] = useState<TabId>(tabFromRoute);
  useEffect(() => setTabState(tabFromRoute), [tabFromRoute]);

  const setTab = useCallback(
    (t: TabId) => {
      setTabState(t);
      navigate(`/baseball/league/${leagueId}/${t}`);
    },
    [navigate, leagueId],
  );

  // Gate role-restricted tabs once both league and user have loaded.
  //
  // Uses isCommissioner/isMember (ground-truth booleans) rather than
  // effIsCommish/effIsMember, which reflect the stored role *preference*
  // and may disagree with actual permissions (e.g. a commissioner viewing
  // as 'member' role has effIsCommish=false but isCommissioner=true).
  //
  // Also blocks on !userTeamIdSettled so non-commissioner members aren't
  // redirected while the userTeamId lazy query is in-flight (the auth-done
  // → team-query-resolved gap that caused Phase 6 failures for Manager1).
  useEffect(() => {
    if (leagueLoading || !userTeamIdSettled) return;
    if (tab === 'commish' && !isCommissioner) setTab('overview');
    if ((tab === 'roster' || tab === 'team') && !isMember) setTab('overview');
  }, [tab, isCommissioner, isMember, setTab, leagueLoading, userTeamIdSettled]);

  const onTeamNav = useCallback(
    (teamId: number) => {
      navigate(`/baseball/teams/${teamId}`);
    },
    [navigate],
  );

  const [seasonValue, setSeasonValue] = useState<string>(
    String(league?.seasonNumber ?? new Date().getFullYear()),
  );
  useEffect(() => {
    if (league?.seasonNumber) setSeasonValue(String(league.seasonNumber));
  }, [league?.seasonNumber]);
  const seasonOptions = useMemo(
    () => [
      {
        value: String(league?.seasonNumber ?? new Date().getFullYear()),
        label: `Season ${league?.seasonNumber ?? new Date().getFullYear()} · ${
          league?.frozenAt ? 'Final' : 'Active'
        }`,
      },
    ],
    [league?.seasonNumber, league?.frozenAt],
  );

  if (leagueLoading && !league) {
    return (
      <div className="ls-root">
        <div
          className="ls-page"
          role="main"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="ls-loading" role="status">
            Loading league…
          </div>
        </div>
      </div>
    );
  }

  if (leagueError || !league) {
    return (
      <div className="ls-root">
        <div className="ls-page">
          <div className="ls-empty">
            <h3>League not found</h3>
            <p>
              {leagueError?.message ??
                'This league does not exist or you do not have access.'}
            </p>
            <button
              className="ls-btn ls-btn-ghost"
              onClick={() => navigate('/baseball/leagues')}
              type="button"
            >
              Back to Leagues
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <LeagueWebSocketContext.Provider
      value={{ client: wsClient, connected: wsConnected }}
    >
      <LeagueWSPageHandler
        onDraftStarted={() => {
          void refetchLeague();
        }}
      />
      <div className="ls-root">
        <PageMeta
          title={`${league.name ?? 'League'} · Legacy Sports`}
          description={`Manage and view ${league.name ?? 'your league'} — matchups, roster, standings, trades and more.`}
        />
        <RoleBar
          role={role}
          setRole={setRole}
          season={seasonValue}
          setSeason={setSeasonValue}
          seasons={seasonOptions}
          isCommissioner={isCommissioner}
          isMember={isMember}
          leagueName={league.name}
        />
        <div className="ls-page">
          <LeagueHero
            league={{
              name: league.name ?? 'League',
              scoringLabel: scoringProfileName,
              era:
                league.minCareerSeasons || league.minCareerGames
                  ? `Career filter · ${league.minCareerSeasons ?? 0}+ seasons`
                  : 'All-Time',
              draftStatus: league.draftStatus ?? 'pre-draft',
              currentWeek: league.currentWeekNumber ?? null,
              totalMatchups: league.totalMatchups ?? null,
              teamCount: teams.length || null,
              inviteCode: league.inviteCode,
            }}
            onBack={() => navigate('/baseball/leagues')}
            onInvite={() => setTab('overview')}
            isCommissioner={effIsCommish}
          />
          <TabBar
            active={tab}
            onChange={setTab}
            onAnalyticsNavigate={() =>
              navigate(`/leagues/${leagueId}/analytics`)
            }
            isMember={effIsMember}
            isCommissioner={effIsCommish}
          />

          {tab === 'overview' && (
            <div
              role="tabpanel"
              id="panel-overview"
              aria-labelledby="tab-overview"
            >
              <OverviewTab
                league={league}
                teams={teams}
                myTeamId={userTeamId ?? null}
                isCommissioner={effIsCommish}
                onTab={setTab}
                onTeam={onTeamNav}
                onJoinDraft={() =>
                  navigate(`/baseball/league/${leagueId}/draft`)
                }
                currentUserId={user?.id ?? null}
                myRoster={myRoster}
              />
            </div>
          )}
          {tab === 'matchup' && (
            <div
              role="tabpanel"
              id="panel-matchup"
              aria-labelledby="tab-matchup"
            >
              <MatchupTab
                league={league}
                myTeamId={userTeamId ?? null}
                initialMatchupId={routeMatchupId ?? null}
                onTeam={onTeamNav}
              />
            </div>
          )}
          {tab === 'roster' && (isMember || !userTeamIdSettled) && (
            <div role="tabpanel" id="panel-roster" aria-labelledby="tab-roster">
              <RosterTab league={league} myTeamId={userTeamId ?? null} />
            </div>
          )}
          {tab === 'free-agents' && (
            <div
              role="tabpanel"
              id="panel-free-agents"
              aria-labelledby="tab-free-agents"
            >
              <FreeAgentsTab
                league={league}
                isMember={effIsMember}
                myTeamId={userTeamId ?? null}
              />
            </div>
          )}
          {tab === 'standings' && (
            <div
              role="tabpanel"
              id="panel-standings"
              aria-labelledby="tab-standings"
            >
              <StandingsTab
                league={league}
                teams={teams}
                myTeamId={userTeamId ?? null}
                onTeam={onTeamNav}
              />
            </div>
          )}
          {tab === 'trades' && (
            <div role="tabpanel" id="panel-trades" aria-labelledby="tab-trades">
              <TradesTab
                league={league}
                isMember={effIsMember}
                myTeamId={userTeamId ?? null}
                isCommissioner={isCommissioner}
              />
            </div>
          )}
          {tab === 'history' && (
            <div
              role="tabpanel"
              id="panel-history"
              aria-labelledby="tab-history"
            >
              <HistoryTab league={league} />
            </div>
          )}
          {tab === 'team' && (isMember || !userTeamIdSettled) && (
            <div role="tabpanel" id="panel-team" aria-labelledby="tab-team">
              <TeamTab
                league={league}
                myTeamId={userTeamId ?? null}
                myTeam={teams.find((t) => t.id === userTeamId) ?? null}
              />
            </div>
          )}
          {tab === 'commish' && settingsError ? (
            <div
              role="alert"
              aria-live="assertive"
              style={{
                background: 'rgba(196, 30, 58, 0.1)',
                border: '1px solid rgba(196, 30, 58, 0.4)',
                borderRadius: 8,
                padding: 12,
                color: '#c41e3a',
                fontWeight: 600,
              }}
            >
              Error saving settings: {settingsError}
            </div>
          ) : null}
          {tab === 'commish' && settingsSuccess ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.4)',
                borderRadius: 8,
                padding: 12,
                color: '#16a34a',
                fontWeight: 600,
              }}
            >
              {settingsSuccess}
            </div>
          ) : null}
          {tab === 'commish' && isCommissioner && (
            <div
              role="tabpanel"
              id="panel-commish"
              aria-labelledby="tab-commish"
            >
              <CommishTab
                league={league}
                teams={teams}
                onSettingsSuccess={setSettingsSuccess}
                onSettingsError={setSettingsError}
              />
            </div>
          )}
        </div>
      </div>
    </LeagueWebSocketContext.Provider>
  );
}

export default LeagueDetailPageV2;
