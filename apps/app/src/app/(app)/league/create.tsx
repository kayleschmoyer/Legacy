import React, { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import {
  LeagueCreateWizard,
  type LeagueCreateWizardForm,
  type WizardSport,
} from '@legacy-sports/shared-components/leagues';
import { LOGGER } from '@legacy-sports/logging';
import {
  type CreateLeagueAndTeamsInput,
  CreateLeagueMutation,
  DefensiveFormat as DefensiveFormatEnum,
  Sport,
  useCreateLeagueMutation,
} from '@legacy-sports/graphql';
import { useSubscription } from '../../../features/subscription';
import { trackPremiumFeatureClick } from '../../../utils/analytics';

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
      : {
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
        }),
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

  const [createLeagueAndTeams, { loading, error }] = useCreateLeagueMutation({
    onCompleted: (data: CreateLeagueMutation) => {
      const leagueId = data.createLeagueAndTeams?.league?.id;
      if (leagueId) {
        router.push(`/${sport}/league/${leagueId}`);
      }
    },
    onError: (err: unknown) => {
      LOGGER.error(
        'Error creating league:',
        err instanceof Error ? err : new Error(String(err)),
      );
      const message =
        err instanceof Error ? err.message : 'Failed to create league';
      Alert.alert('Error', message);
    },
  });

  const handleSubmit = useCallback(
    (form: LeagueCreateWizardForm) => {
      void (async () => {
        try {
          await createLeagueAndTeams({
            variables: { input: buildCreateLeagueInput(form, sport) },
          });
        } catch (err) {
          LOGGER.error(
            'Error in handleSubmit:',
            err instanceof Error ? err : new Error(String(err)),
          );
          Alert.alert('Error', 'Failed to create league. Please try again.');
        }
      })();
    },
    [createLeagueAndTeams, sport],
  );

  const handleClose = useCallback(
    (isDirty: boolean) => {
      const leave = () => router.navigate(`/${sport}`);
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
    [router, sport],
  );

  const handleUpgrade = useCallback(
    (featureName: string) => {
      trackPremiumFeatureClick(featureName);
      void router.navigate('subscription-settings');
    },
    [router],
  );

  return (
    <LeagueCreateWizard
      sport={sport}
      initialLeagueName={prefillName ?? ''}
      isPremium={isPremium}
      premiumLoading={premiumLoading}
      submitting={loading}
      submitError={error?.message}
      onSubmit={handleSubmit}
      onClose={handleClose}
      onUpgrade={handleUpgrade}
    />
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
