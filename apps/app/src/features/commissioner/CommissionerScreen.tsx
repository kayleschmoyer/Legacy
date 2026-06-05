import React, { useMemo } from 'react';
import { Alert, ScrollView } from 'react-native';
import { LOGGER } from '@legacy-sports/logging';
import { Card, H3, Separator, Text, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import {
  AchievementRestrictionsControl,
  CommissionerAuditLog,
  CommissionerNoteControl,
  DeleteLeagueControl,
  DraftOrderControl,
  DraftSettingsControl,
  LeagueBrandingControl,
  LeagueSettingsControl,
  NextStepControl,
  SeasonAwardsControl,
  WaiverProcessControl,
} from '@legacy-sports/shared-components/commissioner';
import { LeagueDuesSetup } from './LeagueDuesSetup';
import { Sport } from '../../api/db/graphql.generated';
import type { LeagueFragment } from '../../api/db/graphql.generated';
import { LeagueScoringEditor } from '../scoring/LeagueScoringEditor';
import { useLeagueScoringSettings } from '../../common/scoring/LeagueScoringProvider';
import {
  useCurrentWeek,
  useMatchupsForLeague,
} from '../matchup/hooks/useMatchup';
import { useSubscription } from '../subscription';

export interface CommissionerScreenProps {
  leagueId: number;
  league: LeagueFragment;
  onLeagueDeleted: () => void;
}

export function CommissionerScreen({
  leagueId,
  league,
  onLeagueDeleted,
}: CommissionerScreenProps): React.JSX.Element {
  const router = useRouter();
  const { isPremium } = useSubscription();
  const isFootball = league.sport === Sport.Football;

  const {
    profile: scoringProfile,
    loading: scoringLoading,
    error: scoringError,
    refetch: refetchScoringProfile,
  } = useLeagueScoringSettings(leagueId);

  const { matchups: allMatchups } = useMatchupsForLeague(leagueId);
  const { currentWeek } = useCurrentWeek(leagueId);

  const currentMatchup = useMemo(() => {
    if (!currentWeek || !allMatchups.length) return null;
    return allMatchups.find((m) => m.weekNumber === currentWeek) ?? null;
  }, [allMatchups, currentWeek]);

  const handleAlert = (title: string) => (msg: string) =>
    Alert.alert(title, msg);
  const handleError = (err: Error) => {
    LOGGER.error('CommissionerScreen error:', err);
    Alert.alert('Error', err.message);
  };

  return (
    <ScrollView>
      <YStack padding="$4" gap="$4">
        <H3>Commissioner Settings</H3>

        <NextStepControl
          leagueId={leagueId}
          currentMatchup={currentMatchup}
          gamesPerMatchup={league.gamesPerMatchup ?? 1}
          draftStatus={league.draftStatus}
          leagueName={league.name ?? ''}
          frozenAt={league.frozenAt ?? undefined}
          totalMatchups={league.totalMatchups ?? undefined}
          onSuccess={() => undefined}
          onError={handleError}
          onNavigateToDraftBoard={() =>
            router.navigate({
              pathname: '/DraftBoardPage',
              params: { leagueId: String(leagueId) },
            })
          }
        />

        <CommissionerNoteControl
          leagueId={leagueId}
          currentNote={league.lmNotes ?? ''}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />

        <LeagueSettingsControl
          leagueId={leagueId}
          sport={league.sport ?? undefined}
          draftStatus={league.draftStatus}
          currentGamesPerMatchup={league.gamesPerMatchup ?? 1}
          currentSpStartsPerMatchup={league.pitcherStartsPerMatchup ?? 1}
          currentMinCareerGames={league.minCareerGames ?? 50}
          currentMinCareerSeasons={league.minCareerSeasons ?? 3}
          currentTotalMatchups={league.totalMatchups ?? 10}
          currentPlayoffEnabled={league.playoffEnabled ?? true}
          currentPlayoffFormat={league.playoffFormat ?? '4-team'}
          currentPlayoffMultiWeek={league.playoffMultiWeek ?? false}
          currentSalaryCapEnabled={league.salaryCapEnabled ?? false}
          currentSalaryCap={league.salaryCap ?? null}
          isPremium={isPremium}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />

        {!isFootball && (
          <DraftSettingsControl
            leagueId={leagueId}
            draftStatus={league.draftStatus}
            playerPool={league.playerPool ?? undefined}
            eraFilter={league.eraFilter ?? undefined}
            baseballHofOnly={league.baseballHofOnly ?? undefined}
            customEraStartYear={league.customEraStartYear ?? undefined}
            customEraEndYear={league.customEraEndYear ?? undefined}
            onSuccess={handleAlert('Success')}
            onError={handleError}
          />
        )}

        <DraftOrderControl
          leagueId={leagueId}
          draftStatus={league.draftStatus}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />

        <LeagueBrandingControl
          leagueId={leagueId}
          leagueName={league.name ?? ''}
          currentLogoUrl={league.logoUrl ?? undefined}
          currentBannerUrl={league.bannerUrl ?? undefined}
          currentPrimaryColor={league.primaryColor ?? undefined}
          currentSecondaryColor={league.secondaryColor ?? undefined}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />

        <LeagueDuesSetup
          leagueId={leagueId}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />

        <SeasonAwardsControl
          leagueId={leagueId}
          currentSeason={league.seasonNumber ?? new Date().getFullYear()}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />

        <LeagueScoringEditor
          leagueId={leagueId}
          profile={scoringProfile}
          loading={scoringLoading}
          error={scoringError}
          onRefetch={async () => {
            await refetchScoringProfile();
          }}
        />

        <AchievementRestrictionsControl
          leagueId={leagueId}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />

        <WaiverProcessControl
          leagueId={leagueId}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />

        <Separator />

        <Card backgroundColor="$red2" borderColor="$red6" padding="$4">
          <YStack gap="$3">
            <Text fontSize="$5" fontWeight="600" color="$red11">
              Danger Zone
            </Text>
            <DeleteLeagueControl
              leagueId={leagueId}
              leagueName={league.name ?? ''}
              onDeleted={() => {
                Alert.alert('Deleted', 'League has been permanently deleted.');
                onLeagueDeleted();
              }}
              onError={handleError}
            />
          </YStack>
        </Card>

        <CommissionerAuditLog leagueId={leagueId} />
      </YStack>
    </ScrollView>
  );
}
