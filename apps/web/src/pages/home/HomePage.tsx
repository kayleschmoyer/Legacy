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
import { OnboardingTutorial } from '@legacy-sports/shared-components/ui';
import {
  DEFAULT_SPORT_FALLBACK,
  type DefaultSport,
  parseDefaultSport,
  USER_PREFERENCES_STORAGE_KEY,
} from '@legacy-sports/shared-components/utils';
import {
  useGetArchivedUserLeagueSummariesLazyQuery,
  useGetArchivedUserLeagueSummariesQuery,
  useGetMyMockDraftUsageQuery,
  useGetUserLeagueStandingsQuery,
  useGetUserLeagueSummariesQuery,
  useGetUserPreferencesQuery,
  type UserLeagueSummaryFragment,
  useUpdateUserPreferencesMutation,
} from '@legacy-sports/graphql';
import { LOGGER } from '@legacy-sports/logging';
import {
  getOnboardingKey,
  migrateLegacyOnboardingFlag,
  parseOnboardingComplete,
  serializeOnboardingComplete,
} from '@legacy-sports/shared-components/utils';
import { getOnboardingStepKey, readOnboardingStep } from './onboardingStorage';
import { leagueDetailRoute, leagueRosterRoute } from './homeRoutes';
import { formatDisplayName } from '../../lib/formatDisplayName';
import { PageMeta } from '../../components/PageMeta';
import {
  buildOnboardingUpsell,
  onboardingTutorialAnalytics,
  renderOnboardingLink,
} from '../../utils/onboardingTutorialWeb';
import {
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors';
import { useThemeContext } from '../../context/ThemeContext';
import { useIsPremiumStatus } from '../../hooks/useIsPremium';

/* ─── Routes ─── */

const CREATE_BASEBALL_LEAGUE_ROUTE = '/baseball/league/create';
const JOIN_BASEBALL_LEAGUE_ROUTE = '/baseball/league/join';
const MOCK_DRAFT_ROUTE = '/baseball/mock-draft';

/** Live draft room for a league (`/:sport/league/:id/draft`, app.tsx). */
function leagueDraftRoomRoute(
  summary: Pick<UserLeagueSummaryFragment, 'leagueId' | 'sport'>,
): string {
  return `${leagueDetailRoute(summary)}/draft`;
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

function readDefaultSport(): DefaultSport {
  try {
    return parseDefaultSport(
      localStorage.getItem(USER_PREFERENCES_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_SPORT_FALLBACK;
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
  const [ctaFocusRequest, setCtaFocusRequest] = useState(0);
  const [tutorialInitialStep, setTutorialInitialStep] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const { resolvedTheme } = useThemeContext();
  const isLight = resolvedTheme === 'light';
  const { isPremium, isLoading: premiumLoading } = useIsPremiumStatus();

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
  // Only a successful, empty summaries response proves the user is new. A
  // failed query (offline, flaky network) also leaves the summaries empty, and
  // must not be read as "no leagues" — that opened the tutorial over the
  // dashboard error state for existing users (LS-10716).
  // The server flag is the source of truth so completion follows the user
  // across browsers/devices; localStorage stays as a same-device cache and the
  // fallback when the preferences query fails (LS-6890).
  const {
    data: prefsData,
    loading: prefsLoading,
    error: prefsError,
  } = useGetUserPreferencesQuery({
    skip: !sessionPresent,
    fetchPolicy: 'cache-and-network',
  });
  const [updatePreferences] = useUpdateUserPreferencesMutation();
  const prefsSettled = !prefsLoading && (prefsData != null || !!prefsError);
  const serverOnboardingCompleted =
    prefsData?.getUserPreferences?.onboardingCompletedAt != null;

  const persistOnboardingCompleteToServer = useCallback(() => {
    updatePreferences({
      variables: { input: { markOnboardingComplete: true } },
    }).catch((caught: unknown) => {
      LOGGER.error(
        'HomePage: failed to persist onboarding completion to server',
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    });
  }, [updatePreferences]);

  const confirmedNoLeagues =
    !summariesLoading &&
    !summariesError &&
    summaryData?.getUserLeagueSummaries != null &&
    summaryData.getUserLeagueSummaries.length === 0;

  useEffect(() => {
    if (!userId || !confirmedNoLeagues || !prefsSettled) return;
    const key = getOnboardingKey(userId);
    try {
      if (serverOnboardingCompleted) {
        // Seed this browser so the flag survives a later server outage.
        window.localStorage.setItem(key, serializeOnboardingComplete(true));
        window.localStorage.removeItem(getOnboardingStepKey(userId));
        return;
      }
      const legacyComplete = migrateLegacyOnboardingFlag(
        window.localStorage,
        key,
      );
      const completed =
        legacyComplete ||
        parseOnboardingComplete(window.localStorage.getItem(key));
      if (completed) {
        // Completed before the server flag existed: backfill it.
        if (!prefsError) persistOnboardingCompleteToServer();
        return;
      }
      setTutorialInitialStep(
        readOnboardingStep(window.localStorage, getOnboardingStepKey(userId)),
      );
      setTutorialOpen(true);
    } catch (caught) {
      // Without storage we cannot tell whether the tutorial was already
      // completed, so leave it closed rather than re-showing it on every
      // visit; "How it works" still opens it on demand.
      LOGGER.error(
        'HomePage: onboarding localStorage access failed',
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    }
  }, [
    userId,
    confirmedNoLeagues,
    prefsSettled,
    prefsError,
    serverOnboardingCompleted,
    persistOnboardingCompleteToServer,
  ]);

  const handleTutorialClose = () => {
    setTutorialOpen(false);
    // Hand keyboard focus to the empty-state CTA once the modal is gone (LS-6918).
    setCtaFocusRequest((n) => n + 1);
    if (userId) {
      persistOnboardingCompleteToServer();
      try {
        window.localStorage.setItem(
          getOnboardingKey(userId),
          serializeOnboardingComplete(true),
        );
        window.localStorage.removeItem(getOnboardingStepKey(userId));
      } catch (caught) {
        LOGGER.error(
          'HomePage: failed to persist onboarding completion',
          caught instanceof Error ? caught : new Error(String(caught)),
        );
      }
    }
  };

  // Escape hides the tutorial for this visit only (LS-6909): it is not a
  // confirmed skip, so the completion flag and saved step are left alone and
  // the tutorial resumes where the user was on their next visit to Home.
  const handleTutorialDismiss = () => {
    setTutorialOpen(false);
  };

  // "Get Started" on the final step sends a user with no leagues straight to
  // league creation (LS-6908). The Skip buttons still call handleTutorialClose
  // and leave them on Home, whose empty state carries the create-league CTA.
  // A user re-launching the tutorial with leagues stays put.
  const handleTutorialGetStarted = () => {
    handleTutorialClose();
    if (!hasLeagues) navigate(CREATE_BASEBALL_LEAGUE_ROUTE);
  };

  const handleTutorialStepChange = (step: number) => {
    if (!userId) return;
    try {
      window.localStorage.setItem(getOnboardingStepKey(userId), String(step));
    } catch (caught) {
      LOGGER.error(
        'HomePage: failed to persist onboarding step',
        caught instanceof Error ? caught : new Error(String(caught)),
      );
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
      {tutorialOpen && (
        <OnboardingTutorial
          onClose={handleTutorialClose}
          onGetStarted={handleTutorialGetStarted}
          onDismiss={handleTutorialDismiss}
          initialStep={tutorialInitialStep}
          onStepChange={handleTutorialStepChange}
          analytics={onboardingTutorialAnalytics}
          renderLink={renderOnboardingLink}
          upsell={
            // Premium users must never see the upsell; wait for status to load.
            !premiumLoading && !isPremium
              ? buildOnboardingUpsell((path) => navigate(path))
              : undefined
          }
          isPremium={isPremium}
        />
      )}
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
          onSetLineup={(s) => navigate(leagueRosterRoute(s))}
          onMockDraft={(s) => navigate(leagueMockDraftRoute(s))}
          onJoinDraft={(s) => navigate(leagueDraftRoomRoute(s))}
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
          mockDraftResetsAt={mockDraftUsage?.resetsAt ?? null}
          onHowItWorks={() => setTutorialOpen(true)}
          focusCtaRequest={ctaFocusRequest}
          onCreateSalaryCapLeague={() => navigate(CREATE_BASEBALL_LEAGUE_ROUTE)}
          onCreateAuctionLeague={() => navigate(CREATE_BASEBALL_LEAGUE_ROUTE)}
        />
      </div>
    </>
  );
}

export default HomePage;
