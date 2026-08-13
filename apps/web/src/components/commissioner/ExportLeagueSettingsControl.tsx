import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Text, XStack, YStack } from 'tamagui';
import { Download } from '@tamagui/lucide-icons/icons/Download';
import { useGetLeagueTeamsQuery } from '@legacy-sports/graphql';
import { LOGGER } from '@legacy-sports/logging';
import {
  buildLeagueSettingsExport,
  downloadJsonFile,
  ExportableSport,
  sanitizeFilenameSegment,
  serializeLeagueSettingsExport,
} from '../../utils/leagueSettingsExport';

export interface ExportLeagueSettingsControlProps {
  leagueId: number;
  sport: ExportableSport;
  leagueName: string;
  playerPool?: string | null;
  maxRosterSize?: number | null;
  waiverType?: string | null;
  faabBudgetDefault?: number | null;
  isPublic?: boolean | null;
  gamesPerMatchup?: number | null;
  eraFilter?: string | null;
  baseballHofOnly?: boolean | null;
  customEraStartYear?: number | null;
  customEraEndYear?: number | null;
  salaryCapEnabled?: boolean | null;
  salaryCap?: number | null;
  salaryFloor?: number | null;
  luxuryTaxThreshold?: number | null;
  minSalary?: number | null;
  salaryEscalationPct?: number | null;
  salaryDecayPct?: number | null;
  auctionBudget?: number | null;
  auctionMinBid?: number | null;
  allowDraftSlotTrading?: boolean | null;
  rosterContinuity?: string | null;
  keeperCount?: number | null;
  keeperCostModel?: string | null;
  maxConsecutiveKeeps?: number | null;
  rookieExempt?: boolean | null;
  defensiveFormat?: string | null;
}

/**
 * Downloads the current league's settings as a JSON file (LS-9146), so a
 * commissioner can re-import them on the create-league page when starting a
 * new league. One-time draft-setup inputs (draft mode/order, scheduling
 * strategy, pick timer) aren't persisted on the league after creation and
 * are intentionally excluded — see leagueSettingsExport.ts.
 */
export function ExportLeagueSettingsControl(
  props: ExportLeagueSettingsControlProps,
): React.JSX.Element {
  const { leagueId, leagueName } = props;
  const [justExported, setJustExported] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    return () => clearTimeout(resetTimeoutRef.current);
  }, []);

  const { data: teamsData } = useGetLeagueTeamsQuery({
    variables: { leagueId },
  });
  const numberOfTeams = teamsData?.leagueTeams?.length;

  const handleExport = useCallback(() => {
    try {
      const envelope = buildLeagueSettingsExport(
        { ...props, numberOfTeams },
        new Date(),
      );
      const json = serializeLeagueSettingsExport(envelope);
      const filename = `${sanitizeFilenameSegment(leagueName) || 'league'}-settings.json`;
      downloadJsonFile(filename, json);
      setJustExported(true);
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = setTimeout(() => setJustExported(false), 2000);
    } catch (error) {
      LOGGER.error(
        'Failed to export league settings',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }, [props, numberOfTeams, leagueName]);

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      padding="$4"
      borderRadius="$6"
      gap="$3"
    >
      <YStack gap="$1">
        <XStack alignItems="center" gap="$2">
          <Download size={18} color="$brandGoldLight" />
          <Text
            fontFamily="$heading"
            fontWeight="700"
            fontSize="$5"
            color="$color"
          >
            Export Settings
          </Text>
        </XStack>
        <Text fontSize="$2" color="$textMuted">
          Download this league&apos;s settings as a JSON file, then import them
          when creating a new league to skip re-entering everything by hand.
        </Text>
      </YStack>
      <XStack alignItems="center" gap="$3">
        <Button
          size="$3"
          variant="outlined"
          icon={<Download size={16} />}
          onPress={handleExport}
          data-testid="export-league-settings-button"
        >
          Download Settings (.json)
        </Button>
        {justExported ? (
          <Text fontSize="$2" color="$brandGoldLight">
            Downloaded!
          </Text>
        ) : null}
      </XStack>
    </Card>
  );
}
