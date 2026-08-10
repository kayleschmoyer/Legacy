import React, { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { Text, YStack } from 'tamagui';
import {
  FREE_LEAGUE_LIMIT,
  getSubmitErrorMessage,
  isLeagueCapError,
  isPremiumRequiredError,
  LeagueCreateWizard,
  type LeagueCreateWizardForm,
  type WizardSport,
} from '@legacy-sports/shared-components/leagues';
import { Dialog } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import {
  type CreateLeagueAndTeamsInput,
  CreateLeagueMutation,
  DefensiveFormat as DefensiveFormatEnum,
  Sport,
  useCreateLeagueMutation,
  useGetUserLeaguesQuery,
} from '@legacy-sports/graphql';
import { useSubscription } from '../../../features/subscription';
import { trackPremiumFeatureClick } from '../../../utils/analytics';
import {
  closeToHomeTab,
  HOME_TAB_HREF,
} from '../../../common/utilities/RouteUtils';

/**
 * Create League — the "Line-score Wizard" (LS-8809).
 *
 * The screen itself is `LeagueCreateWizard` from `lib/shared-components`; this
 * route owns the data layer: the sport it was entered with, the subscription
 * state, the GraphQL mutation, and expo-router navigation. Same split as the
 * Leagues (LS-8795) and Games (LS-8800) tabs.
 *
 * Sport comes from the entry point rather than an in-form selector: the
 * `/baseball/league/create` and `/football/league/create` wrappers forward it
 * as `?sport=`, and anything unrecognized falls back to baseball.
 */

function parseSport(value: string | undefined): WizardSport {
  return value === 'football' ? 'football' : 'baseball';
}

/** Builds the mutation input, sending only the fields the chosen sport uses. */
export function buildCreateLeagueInput(
  form: LeagueCreateWizardForm,
  sport: WizardSport,
): CreateLeagueAndTeamsInput {
  return {
    leagueName: form.leagueName.trim(),
    numberOfTeams: form.numberOfTeams,
    numberOfDivisions: form.numberOfDivisions,
    isPublic: form.isPublic,
    schedulingStrategy: form.schedulingStrategy,
    playerPool: form.playerPool,
    draftMode: form.draftMode,
    selectionMethod: form.selectionMethod,
    draftOrder: form.draftOrder,
    maxRosterSize: form.maxRosterSize,
    startDate: (form.draftDate ?? new Date()).toISOString(),
    ...(sport === 'football'
      ? {
          sport: Sport.Football,
          scoringFormat: form.scoringFormat,
          defensiveFormat:
            form.defensiveFormat === 'idp'
              ? DefensiveFormatEnum.Idp
              : DefensiveFormatEnum.Dst,
        }
      : {}),
    // Era filter, HOF-only, waivers, and the salary cap are premium settings
    // shared by both sports (LS-6138, LS-6143) — the server validates
    // eraFilter against the sport-specific era list, so this is safe to send
    // unconditionally.
    eraFilter: form.baseballEraFilter,
    ...(form.baseballEraFilter === 'custom'
      ? {
          customEraStartYear: form.customEraStartYear,
          customEraEndYear: form.customEraEndYear,
        }
      : {}),
    baseballHofOnly: form.baseballHofOnly,
    waiverType: form.waiverType,
    ...(form.waiverType === 'faab'
      ? { faabBudgetDefault: form.faabBudgetDefault }
      : {}),
    salaryCapEnabled: form.salaryCapEnabled,
    ...(form.salaryCapEnabled ? { salaryCap: form.salaryCap } : {}),
    // Auction budget/min bid only mean anything for an auction draft.
    ...(form.selectionMethod === 'auction'
      ? { auctionBudget: form.auctionBudget, auctionMinBid: form.auctionMinBid }
      : {}),
    // Draft slot trading (LS-8675) — only sent when enabled for a non-auction
    // draft; the server rejects true for auction leagues.
    ...(form.selectionMethod !== 'auction' && form.allowDraftSlotTrading
      ? { allowDraftSlotTrading: true }
      : {}),
  };
}

export default function CreateLeagueScreen(): React.JSX.Element {
  const router = useRouter();
  const { name: prefillName, sport: sportParam } = useLocalSearchParams<{
    name?: string;
    sport?: string;
  }>();
  const sport = parseSport(sportParam);

  const { isPremium, loading: premiumLoading } = useSubscription();

  // Post-creation interstitial (LS-6136) — web shows a "League created!"
  // dialog with the invite code before continuing to the league page; mobile
  // used to skip straight to `router.replace`, dropping the user into a
  // brand-new league with no teams, invites, or draft date and no guidance.
  const [createdLeague, setCreatedLeague] = useState<{
    id: number;
    name: string;
    inviteCode: string | null;
  } | null>(null);

  // Preflight league-count check (LS-6133): without this, a free user at the
  // cap only finds out on final submit, after typing through all five steps.
  // A failed query fails closed (treated as at-limit) rather than silently
  // defaulting leagueCount to 0 and letting a free user bypass the cap.
  const { data: leaguesData, error: leaguesQueryError } =
    useGetUserLeaguesQuery();
  // userLeagues is paginated (LS-9101) — use the authoritative unpaginated
  // total instead of array length so this gate stays correct past the page size.
  const leagueCount = leaguesData?.userLeagueCount ?? 0;
  const atLeagueLimit =
    !isPremium &&
    !premiumLoading &&
    (leagueCount >= FREE_LEAGUE_LIMIT || leaguesQueryError !== undefined);

  const [createLeagueAndTeams, { loading, error }] = useCreateLeagueMutation({
    onCompleted: (data: CreateLeagueMutation) => {
      const league = data.createLeagueAndTeams?.league;
      if (league?.id) {
        setCreatedLeague({
          id: league.id,
          name: league.name ?? '',
          inviteCode: league.inviteCode ?? null,
        });
      }
    },
    onError: (err: unknown) => {
      // The real error goes to the log; the user only ever sees an allowlisted
      // server message or the generic fallback, never raw server vocabulary
      // (LS-8814 / LS-6069).
      LOGGER.error(
        'Error creating league:',
        err instanceof Error ? err : new Error(String(err)),
      );
      // The free-tier 3-league cap has an actual escape hatch (deleting an
      // existing league) besides upgrading, so it gets a third button
      // alongside the standard upgrade prompt instead of just Not now/Upgrade
      // (CLF-012, layered onto CLF-013's PremiumRequiredError prompt below).
      if (isLeagueCapError(err)) {
        Alert.alert('Upgrade Required', getSubmitErrorMessage(err), [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Manage Leagues',
            onPress: () => router.navigate(HOME_TAB_HREF),
          },
          {
            text: 'Upgrade',
            onPress: () => {
              trackPremiumFeatureClick('league-create-submit');
              void router.navigate('subscription-settings');
            },
          },
        ]);
        return;
      }
      // A PremiumRequiredError gets a dedicated upgrade prompt instead of the
      // generic red error banner — it isn't a validation mistake the user can
      // fix by editing the form (CLF-013).
      if (isPremiumRequiredError(err)) {
        Alert.alert('Upgrade Required', getSubmitErrorMessage(err), [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Upgrade',
            onPress: () => {
              trackPremiumFeatureClick('league-create-submit');
              void router.navigate('subscription-settings');
            },
          },
        ]);
        return;
      }
      Alert.alert('Error', getSubmitErrorMessage(err));
    },
  });

  const handleSubmit = useCallback(
    (form: LeagueCreateWizardForm) => {
      // The mutation's `onError` above already logs and alerts on failure;
      // this catch only prevents an unhandled promise rejection, not a
      // second Alert (LS-6135).
      void createLeagueAndTeams({
        variables: { input: buildCreateLeagueInput(form, sport) },
      }).catch(() => undefined);
    },
    [createLeagueAndTeams, sport],
  );

  const handleContinueToLeague = useCallback(() => {
    if (!createdLeague) return;
    // Replace, not push: swaps the finished wizard for the league page
    // instead of stacking on top of it, so back lands on whatever surface
    // opened the wizard (the Home tab) rather than a completed,
    // non-resubmittable "step 5" (LS-8844). Same reasoning as the cancel
    // path's closeToHomeTab below.
    router.replace(`/${sport}/league/${createdLeague.id}`);
    setCreatedLeague(null);
  }, [createdLeague, router, sport]);

  const handleClose = useCallback(
    (isDirty: boolean) => {
      // Cancelling returns the user to the surface they opened the wizard from
      // — the Home tab in the reported repro. It used to push `/${sport}`,
      // which dropped them on the standalone sport home outside the tab shell
      // and looked like a second home page (LS-8823).
      const leave = () => closeToHomeTab(router);
      if (!isDirty) {
        leave();
        return;
      }
      Alert.alert(
        'Discard league setup?',
        'Your settings will be lost.',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: leave },
        ],
        { cancelable: true },
      );
    },
    [router],
  );

  const handleUpgrade = useCallback(
    (featureName: string) => {
      trackPremiumFeatureClick(featureName);
      void router.navigate('subscription-settings');
    },
    [router],
  );

  return (
    <>
      <LeagueCreateWizard
        sport={sport}
        initialLeagueName={prefillName ?? ''}
        isPremium={isPremium}
        premiumLoading={premiumLoading}
        submitting={loading}
        // Same allowlist as the Alert above — `error` here is the very error
        // `onError` already logged, so this path only decides what to display.
        submitError={error ? getSubmitErrorMessage(error) : undefined}
        atLeagueLimit={atLeagueLimit}
        onSubmit={handleSubmit}
        onClose={handleClose}
        onUpgrade={handleUpgrade}
      />
      <Dialog
        open={createdLeague !== null}
        onOpenChange={(open) => {
          if (!open) handleContinueToLeague();
        }}
        title="League created!"
        description={
          createdLeague?.inviteCode
            ? `Share this invite code so managers can join ${createdLeague.name}.`
            : `${createdLeague?.name ?? 'Your league'} is ready.`
        }
        confirmLabel="Continue to League"
        cancelLabel="Got it"
        onConfirm={handleContinueToLeague}
        onCancel={handleContinueToLeague}
      >
        {createdLeague?.inviteCode ? (
          <YStack
            alignItems="center"
            paddingVertical="$3"
            paddingHorizontal="$4"
            borderRadius="$4"
            borderWidth={1}
            borderColor="$outlineStrong"
            backgroundColor="$surfacePanel"
          >
            <Text
              fontFamily="$heading"
              fontWeight="800"
              fontSize={20}
              letterSpacing={1.2}
              color="$brandGoldLight"
            >
              {createdLeague.inviteCode}
            </Text>
          </YStack>
        ) : null}
      </Dialog>
    </>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
