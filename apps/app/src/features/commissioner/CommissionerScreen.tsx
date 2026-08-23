import React, { useMemo, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { LOGGER } from '@legacy-sports/logging';
import { Button, Card, H3, Text, YStack } from 'tamagui';
import { ChevronDown } from '@tamagui/lucide-icons/icons/ChevronDown';
import { ChevronUp } from '@tamagui/lucide-icons/icons/ChevronUp';
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
  RosterRequirementsControl,
  SeasonAwardsControl,
  WaiverProcessControl,
} from '@legacy-sports/shared-components/commissioner';
import { Sport } from '@legacy-sports/graphql';
import type { AppLeagueFragment } from '@legacy-sports/graphql';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { LeagueDuesSetup } from './LeagueDuesSetup';
import { LeagueScoringEditor } from '../scoring/LeagueScoringEditor';
import { useLeagueScoringSettings } from '../../common/scoring/LeagueScoringProvider';
import {
  useCurrentWeek,
  useMatchupsForLeague,
} from '../matchup/hooks/useMatchup';
import { useSubscription } from '../subscription';
import { useHasEntitlement } from '../subscription/useSubscription';

interface CommissionerAccordionSection {
  id: string;
  label: string;
  content: React.ReactNode;
}

/** "Next Step" is open by default; every other section starts collapsed. */
const DEFAULT_OPEN_SECTION_ID = 'next-step';

function CommissionerAccordionItem({
  section,
  open,
  onToggle,
}: {
  section: CommissionerAccordionSection;
  open: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <YStack>
      <Button
        testID={`commissioner-accordion-header-${section.id}`}
        onPress={onToggle}
        backgroundColor="$gray2"
        justifyContent="space-between"
        accessibilityState={{ expanded: open }}
        chromeless
      >
        <Text fontSize="$4" fontWeight="600">
          {section.label}
        </Text>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </Button>
      {open ? (
        <YStack
          testID={`commissioner-accordion-content-${section.id}`}
          paddingTop="$3"
        >
          {section.content}
        </YStack>
      ) : null}
    </YStack>
  );
}

export interface CommissionerScreenProps {
  leagueId: number;
  league: AppLeagueFragment;
  onLeagueDeleted: () => void;
}

export function CommissionerScreen({
  leagueId,
  league,
  onLeagueDeleted,
}: CommissionerScreenProps): React.JSX.Element {
  const router = useRouter();
  const { isPremium } = useSubscription();
  const hasCustomScoringMultipliers = useHasEntitlement(
    ENTITLEMENTS.custom_scoring_multipliers,
  );
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

  const [openSectionId, setOpenSectionId] = useState<string>(
    DEFAULT_OPEN_SECTION_ID,
  );

  const sections: CommissionerAccordionSection[] = [
    {
      id: 'next-step',
      label: 'Next Step',
      content: (
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
      ),
    },
    {
      id: 'commissioner-note',
      label: 'Commissioner Note',
      content: (
        <CommissionerNoteControl
          leagueId={leagueId}
          currentNote={league.lmNotes ?? ''}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />
      ),
    },
    {
      id: 'league-settings',
      label: 'League Settings',
      content: (
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
          currentWaiverType={league.waiverType === 'faab' ? 'faab' : 'standard'}
          currentFaabBudgetDefault={league.faabBudgetDefault ?? 100}
          isPremium={isPremium}
          onUpgrade={() => router.navigate('/subscription-settings')}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />
      ),
    },
    {
      id: 'draft-settings',
      label: 'Draft Settings',
      content: (
        <DraftSettingsControl
          leagueId={leagueId}
          draftStatus={league.draftStatus}
          playerPool={league.playerPool ?? undefined}
          sport={isFootball ? 'football' : 'baseball'}
          rosterContinuity={league.rosterContinuity}
          eraFilter={league.eraFilter ?? undefined}
          baseballHofOnly={league.baseballHofOnly ?? undefined}
          customEraStartYear={league.customEraStartYear ?? undefined}
          customEraEndYear={league.customEraEndYear ?? undefined}
          isPremium={isPremium}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />
      ),
    },
    ...(isFootball
      ? [
          {
            id: 'roster-requirements',
            label: 'Roster Requirements',
            content: (
              <RosterRequirementsControl
                leagueId={leagueId}
                defensiveFormat={league.defensiveFormat}
                onSuccess={handleAlert('Success')}
                onError={handleError}
              />
            ),
          },
        ]
      : []),
    {
      id: 'draft-order',
      label: 'Draft Pick Order',
      content: (
        <DraftOrderControl
          leagueId={leagueId}
          draftStatus={league.draftStatus}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />
      ),
    },
    {
      id: 'league-branding',
      label: 'League Branding',
      content: (
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
      ),
    },
    {
      id: 'league-dues',
      label: 'League Dues',
      content: (
        <LeagueDuesSetup
          leagueId={leagueId}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />
      ),
    },
    {
      id: 'season-awards',
      label: 'Season Awards',
      content: (
        <SeasonAwardsControl
          leagueId={leagueId}
          currentSeason={league.seasonNumber ?? new Date().getFullYear()}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />
      ),
    },
    {
      id: 'scoring',
      label: 'Scoring',
      content: (
        <LeagueScoringEditor
          leagueId={leagueId}
          profile={scoringProfile}
          loading={scoringLoading}
          error={scoringError}
          onRefetch={async () => {
            await refetchScoringProfile();
          }}
          sport={league.sport ?? undefined}
          defensiveFormat={league.defensiveFormat}
          isPremium={hasCustomScoringMultipliers}
          onUpgrade={() => router.navigate('/subscription-settings')}
        />
      ),
    },
    {
      id: 'achievement-restrictions',
      label: 'Achievement Restrictions',
      content: (
        <AchievementRestrictionsControl
          leagueId={leagueId}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />
      ),
    },
    {
      id: 'waiver-processing',
      label: 'Waiver Processing',
      content: (
        <WaiverProcessControl
          leagueId={leagueId}
          onSuccess={handleAlert('Success')}
          onError={handleError}
        />
      ),
    },
    {
      id: 'danger-zone',
      label: 'Danger Zone',
      content: (
        <Card backgroundColor="$red2" borderColor="$red6" padding="$4">
          <YStack gap="$3">
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
      ),
    },
    {
      id: 'audit-log',
      label: 'Audit Log',
      content: <CommissionerAuditLog leagueId={leagueId} />,
    },
  ];

  return (
    <ScrollView>
      <YStack padding="$4" gap="$4">
        <H3>Commissioner Settings</H3>

        <YStack gap="$2">
          {sections.map((section) => (
            <CommissionerAccordionItem
              key={section.id}
              section={section}
              open={openSectionId === section.id}
              onToggle={() =>
                setOpenSectionId((current) =>
                  current === section.id ? '' : section.id,
                )
              }
            />
          ))}
        </YStack>
      </YStack>
    </ScrollView>
  );
}
