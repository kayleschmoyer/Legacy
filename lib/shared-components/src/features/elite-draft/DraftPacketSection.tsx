/**
 * DraftPacketSection — premium "see and download the full draft packet"
 * feature (LS-9750). `DraftRoomRecap` already shows the viewer's own team's
 * picks/grade for free; this section adds the complete, all-teams,
 * round-by-round draft results plus a CSV download, gated behind the
 * `draft_packet` entitlement.
 */
import React, { useMemo, useState } from 'react';
import { Button, ScrollView, Text, XStack, YStack } from 'tamagui';
import { Download } from '@tamagui/lucide-icons';
import { buildDraftPacketCsv, draftPacketFilename } from './draftPacketCsv';
import type { DraftPickRecord } from './types';
import { PremiumGate } from '../../components/PremiumGate';

export interface DraftPacketSectionProps {
  pickHistory: DraftPickRecord[];
  teamNameById: (teamId: number | null | undefined) => string;
  leagueName?: string | null;
  isPremium: boolean;
  onUpgrade?: () => void;
  /** Platform-specific persistence for the CSV — web triggers a browser
   * download, mobile opens the native share sheet. Omitted callers get a
   * no-op download button. */
  onDownload?: (contents: string, filename: string) => void;
}

export function DraftPacketSection({
  pickHistory,
  teamNameById,
  leagueName,
  isPremium,
  onUpgrade,
  onDownload,
}: DraftPacketSectionProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const sortedPicks = useMemo(
    () => [...pickHistory].sort((a, b) => a.overallPick - b.overallPick),
    [pickHistory],
  );

  const handleDownload = () => {
    const csv = buildDraftPacketCsv(pickHistory, teamNameById);
    onDownload?.(csv, draftPacketFilename(leagueName));
  };

  return (
    <YStack
      testID="draft-packet-section"
      marginHorizontal="$4"
      marginBottom={16}
    >
      <PremiumGate
        isPremium={isPremium}
        featureName="Draft Packet"
        featureDescription="See and download the full, all-teams draft results."
        onUpgrade={onUpgrade}
      >
        <YStack
          backgroundColor="$surfaceCard"
          borderRadius={14}
          padding={12}
          gap={10}
        >
          <XStack alignItems="center" justifyContent="space-between">
            <Text fontFamily="$heading" fontWeight="800" fontSize={14}>
              Draft Packet
            </Text>
            <XStack gap={8}>
              <Button
                size="$2"
                variant="outlined"
                onPress={() => setExpanded((v) => !v)}
                testID="draft-packet-toggle"
              >
                {expanded ? 'Hide' : 'View Full Draft'}
              </Button>
              <Button
                size="$2"
                icon={<Download size={14} />}
                onPress={handleDownload}
                testID="draft-packet-download"
              >
                Download
              </Button>
            </XStack>
          </XStack>

          {expanded ? (
            <ScrollView style={{ maxHeight: 320 }}>
              <YStack gap={4}>
                {sortedPicks.map((pick) => (
                  <XStack key={pick.id} gap={10} alignItems="center">
                    <Text fontSize={11} color="$fg4" width={44}>
                      {`${pick.round}.${pick.pickNumber}`}
                    </Text>
                    <Text
                      fontSize={11.5}
                      color="$fg3"
                      width={110}
                      numberOfLines={1}
                    >
                      {teamNameById(pick.teamId)}
                    </Text>
                    <Text
                      fontSize={12}
                      color="$color"
                      flex={1}
                      numberOfLines={1}
                    >
                      {pick.player
                        ? `${pick.player.firstName} ${pick.player.lastName}`
                        : '—'}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            </ScrollView>
          ) : null}
        </YStack>
      </PremiumGate>
    </YStack>
  );
}

export default DraftPacketSection;
