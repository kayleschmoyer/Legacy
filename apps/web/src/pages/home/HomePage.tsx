import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  hasStoredSession,
  useAuth,
} from '@legacy-sports/shared-components/auth';
import {
  computePrimarySport,
  type HomeLeagueSummary,
  mergeLeagueStandings,
  OnThisDayFeed,
} from '@legacy-sports/shared-components/leagues';
import { HomeScreen } from '@legacy-sports/shared-components/sports';
import {
  useGetArchivedUserLeagueSummariesLazyQuery,
  useGetArchivedUserLeagueSummariesQuery,
  useGetMyMockDraftUsageQuery,
  useGetUserLeagueStandingsQuery,
  useGetUserLeagueSummariesQuery,
  type UserLeagueSummaryFragment,
} from '@legacy-sports/graphql';
import { LOGGER } from '@legacy-sports/logging';
import { formatDisplayName } from '../../lib/formatDisplayName';
import { OnboardingTutorial } from '../../components/onboarding';
import { PageMeta } from '../../components/PageMeta';
import {
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors';
import { useThemeContext } from '../../context/ThemeContext';
import { useIsPremium } from '../../hooks/useIsPremium';

/* ─── Routes ─── */

const CREATE_BASEBALL_LEAGUE_ROUTE = '/baseball/league/create';
const JOIN_BASEBALL_LEAGUE_ROUTE = '/baseball/league/join';
const MOCK_DRAFT_ROUTE = '/baseball/mock-draft';

function leagueDetailRoute(
  summary: Pick<UserLeagueSummaryFragment, 'leagueId' | 'sport'>,
): string {
  const sportPrefix = summary.sport === 'football' ? 'football' : 'baseball';
  return `/${sportPrefix}/league/${summary.leagueId}`;
}

function leagueMockDraftRoute(
  summary: Pick<
    UserLeagueSummaryFragment,
    'leagueId' | 'teamCount' | 'draftMode'
  >,
): string {
  const params = new URLSearchParams();
  if (summary.leagueId != null)
    params.set('fromLeague', String(summary.leagueId));
  if (summary.teamCount != null) params.set('teams', String(summary.teamCount));
  const order = summary.draftMode === 'linear' ? 'linear' : 'snake';
  params.set('draftOrder', order);
  const qs = params.toString();
  return qs ? `${MOCK_DRAFT_ROUTE}?${qs}` : MOCK_DRAFT_ROUTE;
}

/* ─── Default sport preference ─── */

const PREFS_STORAGE_KEY = 'ls_user_preferences';

function readDefaultSport(): 'baseball' | 'football' {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return 'baseball';
    const parsed = JSON.parse(raw) as { defaultSport?: string };
    return parsed.defaultSport === 'football' ? 'football' : 'baseball';
  } catch {
    return 'baseball';
  }
}

/* ─── Ambient page background (preserves the home gradient backdrop) ─── */

const pageBackgroundStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundImage: `
    radial-gradient(ellipse at 20% 0%,  ${withAlpha(BRAND_NAVY, 0.22)} 0%, transparent 55%),
    radial-gradient(ellipse at 80% 10%, ${withAlpha(BRAND_SEAM_RED, 0.1)} 0%, transparent 45%),
    radial-gradient(ellipse at 50% 90%, ${withAlpha(BRAND_GOLD, 0.08)} 0%, transparent 50%)
  `,
};

/**
 * Home Page — thin web wrapper around the shared `HomeScreen` dashboard.
 *
 * Owns the web data layer (GraphQL queries, theme, onboarding tutorial) and
 * react-router navigation; the shared component owns all presentation so web
 * and mobile render the same dashboard.
 */
export function HomePage(): React.JSX.Element {
  const navigate = useNavigate();
  const auth = useAuth();
  const userId = auth?.user?.id;
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { resolvedTheme } = useThemeContext();
  const isLight = resolvedTheme === 'light';
  const isPremium = useIsPremium();

  const defaultSport = useMemo(() => readDefaultSport(), []);

  // Both dashboard queries take no arguments — the server derives the caller
  // from the HttpOnly JWT cookie. Gating them on `auth.user` meant the page's
  // slowest query was also the last to start, waiting out AuthProvider's
  // bootstrap (and, on an expired cached token, a `/refresh-jwt` round trip)
  // before it could dispatch. A synchronous read of the persisted session is
  // all the gate they actually need (LS-9528).
  const sessionPresent = useMemo(() => hasStoredSession(), []);

  const {
    data: summaryData,
    loading: summariesLoading,
    error: summariesError,
    refetch: refetchSummaries,
  } = useGetUserLeagueSummariesQuery({
    skip: !sessionPresent,
    fetchPolicy: 'cache-and-network',
  });

  // Standings are intentionally a separate, parallel request: they are the slow
  // half of the old combined resolver, and the league cards render without them.
  // It must NOT inherit the summaries' gate, or it lands behind the same wait.
  const { data: standingsData } = useGetUserLeagueStandingsQuery({
    skip: !sessionPresent,
    fetchPolicy: 'cache-and-network',
  });

  const [fetchArchived, { data: archivedData, loading: archivedLoading }] =
    useGetArchivedUserLeagueSummariesLazyQuery({
      fetchPolicy: 'cache-and-network',
    });

  const { data: archivedCachedData } = useGetArchivedUserLeagueSummariesQuery({
    skip: !auth?.user,
    fetchPolicy: 'cache-only',
  });
  const cachedArchivedCount =
    archivedCachedData?.getArchivedUserLeagueSummaries?.length ?? null;

  const { data: mockDraftUsageData } = useGetMyMockDraftUsageQuery({
    skip: !auth?.user,
    fetchPolicy: 'cache-and-network',
  });
  const mockDraftUsage = mockDraftUsageData?.getMyMockDraftUsage;
  const mockDraftAtCap =
    mockDraftUsage != null &&
    mockDraftUsage.isUnlimited !== true &&
    mockDraftUsage.remaining != null &&
    mockDraftUsage.remaining <= 0;

  const handleShowArchived = useCallback(() => {
    setShowArchived(true);
    void fetchArchived();
  }, [fetchArchived]);

  const handleHideArchived = useCallback(() => {
    setShowArchived(false);
  }, []);

  const summaries = useMemo<HomeLeagueSummary[]>(
    () =>
      mergeLeagueStandings(
        summaryData?.getUserLeagueSummaries ?? [],
        standingsData?.getUserLeagueStandings,
      ),
    [
      summaryData?.getUserLeagueSummaries,
      standingsData?.getUserLeagueStandings,
    ],
  );
  const archivedSummaries = useMemo<HomeLeagueSummary[]>(
    () => archivedData?.getArchivedUserLeagueSummaries ?? [],
    [archivedData?.getArchivedUserLeagueSummaries],
  );
  const hasLeagues = summaries.length > 0;
  const primarySport = useMemo(
    () => computePrimarySport(summaries),
    [summaries],
  );

  const userName = formatDisplayName(auth?.user?.username || 'Manager');

  /* ── Onboarding tutorial: show once for new users with no leagues ── */
  const getOnboardingKey = (uid: number) => `ls_onboarding_complete_${uid}`;

  useEffect(() => {
    if (!userId) return;
    if (!hasLeagues && !summariesLoading) {
      const key = getOnboardingKey(userId);
      try {
        const legacyDone = window.localStorage.getItem(
          'ls_onboarding_complete',
        );
        if (legacyDone !== null && (JSON.parse(legacyDone) as boolean)) {
          window.localStorage.setItem(key, JSON.stringify(true));
          window.localStorage.removeItem('ls_onboarding_complete');
          return;
        }
        const stored = window.localStorage.getItem(key);
        const completed =
          stored !== null ? (JSON.parse(stored) as boolean) : false;
        if (!completed) setTutorialOpen(true);
      } catch (caught) {
        LOGGER.error(
          'HomePage: onboarding localStorage access failed',
          caught instanceof Error ? caught : new Error(String(caught)),
        );
        setTutorialOpen(true);
      }
    }
  }, [userId, hasLeagues, summariesLoading]);

  const handleTutorialClose = () => {
    setTutorialOpen(false);
    if (userId) {
      try {
        window.localStorage.setItem(
          getOnboardingKey(userId),
          JSON.stringify(true),
        );
      } catch (caught) {
        LOGGER.error(
          'HomePage: failed to persist onboarding completion',
          caught instanceof Error ? caught : new Error(String(caught)),
        );
      }
    }
  };

  // Deliberately does not wait on the standings query — that is the whole point
  // of splitting it out. League cards render as soon as the summaries land.
  const loading =
    auth.isLoading ||
    (sessionPresent && (summariesLoading || (!summaryData && !summariesError)));
  const error = Boolean(
    summariesError && !summariesLoading && !summaryData?.getUserLeagueSummaries,
  );

  const onThisDay = (
    <OnThisDayFeed
      onPlayerPress={({ playerId, brefId, gameDate }) => {
        // Deep-link straight to the game this entry is about (LS-9763)
        // rather than the player's generic profile page — falls back to the
        // profile page when the identifier can't be resolved to a game date.
        if (brefId && gameDate) {
          const params = new URLSearchParams({
            playerId: brefId,
            startDate: gameDate,
            endDate: gameDate,
          });
          navigate(`/players/view-game-logs?${params.toString()}`);
          return;
        }
        navigate(`/players/${playerId}`);
      }}
    />
  );

  return (
    <>
      <PageMeta
        title="Dashboard"
        description="Your personalized fantasy sports dashboard."
      />
      {tutorialOpen && <OnboardingTutorial onClose={handleTutorialClose} />}
      <div style={pageBackgroundStyle}>
        <HomeScreen
          userName={userName}
          leagues={summaries}
          archivedLeagues={archivedSummaries}
          archivedCount={cachedArchivedCount}
          primarySport={primarySport}
          showArchived={showArchived}
          archivedLoading={archivedLoading}
          loading={loading}
          error={error}
          defaultSport={defaultSport}
          isLight={isLight}
          isPremium={isPremium}
          onThisDay={onThisDay}
          onShowArchived={handleShowArchived}
          onHideArchived={handleHideArchived}
          onRetry={() => void refetchSummaries()}
          onViewLeague={(s) => navigate(leagueDetailRoute(s))}
          onSetLineup={(s) => navigate(leagueDetailRoute(s))}
          onMockDraft={(s) => navigate(leagueMockDraftRoute(s))}
          onCreateLeague={(sportKey) => navigate(`/${sportKey}/league/create`)}
          onJoinLeague={() =>
            navigate(JOIN_BASEBALL_LEAGUE_ROUTE, { state: { from: '/' } })
          }
          onBrowseStats={() => navigate('/players')}
          onViewSport={(sport) =>
            navigate(sport === 'football' ? '/football' : '/baseball')
          }
          onStartMockDraft={() => navigate(MOCK_DRAFT_ROUTE)}
          mockDraftAtCap={mockDraftAtCap}
          onHowItWorks={() => setTutorialOpen(true)}
          onCreateSalaryCapLeague={() => navigate(CREATE_BASEBALL_LEAGUE_ROUTE)}
          onCreateAuctionLeague={() => navigate(CREATE_BASEBALL_LEAGUE_ROUTE)}
        />
      </div>
    </>
  );
}

export default HomePage;
