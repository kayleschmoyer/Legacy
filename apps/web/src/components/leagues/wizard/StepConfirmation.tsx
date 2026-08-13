import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Text, XStack, YStack } from 'tamagui';
import { AlertCircle } from '@tamagui/lucide-icons/icons/AlertCircle';
import { ExternalLink } from '@tamagui/lucide-icons/icons/ExternalLink';
import type { WizardState } from '../CreateLeagueWizard';

interface StepConfirmationProps {
  state: WizardState;
  error: string | null;
  loading: boolean;
  onSubmit: () => void;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <XStack
      padding="$3"
      borderBottomWidth={1}
      borderColor="$surfacePanelBorder"
      alignItems="center"
      justifyContent="space-between"
    >
      <Text fontSize={13} color="$textMuted">
        {label}
      </Text>
      <Text fontSize={13} fontWeight="600" color="$color">
        {value}
      </Text>
    </XStack>
  );
}

function formatRosterSlots(slots: Record<string, number>): string {
  return Object.entries(slots)
    .filter(([, count]) => count > 0)
    .map(([slot, count]) => `${slot}: ${count}`)
    .join(', ');
}

function formatEraFilter(eraFilter: string): string {
  if (eraFilter === 'all') return 'All Eras';
  if (eraFilter === 'custom') return 'Custom';
  return eraFilter
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function formatScoringFormat(
  scoringFormat: WizardState['scoringFormat'],
): string {
  if (scoringFormat === 'standard') return 'Standard';
  if (scoringFormat === 'half_ppr') return 'Half-PPR';
  return 'PPR';
}

export function StepConfirmation({
  state,
  error,
  loading,
  onSubmit,
}: StepConfirmationProps) {
  const navigate = useNavigate();
  const isFootball = state.sport === 'FOOTBALL';

  return (
    <YStack gap="$4">
      <YStack gap="$1">
        <Text
          fontSize={22}
          fontWeight="700"
          fontFamily="$heading"
          color="$color"
        >
          Confirm Your League
        </Text>
        <Text fontSize={14} color="$textMuted">
          Review your settings and create your league.
        </Text>
      </YStack>

      <YStack
        backgroundColor="$surfaceCard"
        borderRadius="$3"
        borderWidth={1}
        borderColor="$surfacePanelBorder"
        overflow="hidden"
      >
        <SummaryRow
          label="Sport"
          value={isFootball ? '🏈 Football' : '⚾ Baseball'}
        />
        <SummaryRow label="League Name" value={state.name || '—'} />
        <SummaryRow label="Teams" value={String(state.numTeams)} />
        <SummaryRow
          label="Selection Method"
          value={
            state.selectionMethod === 'auction'
              ? 'Auction'
              : state.selectionMethod === 'random'
                ? 'Random'
                : 'Standard'
          }
        />
        <SummaryRow
          label="Draft Order"
          value={state.draftOrder === 'snake' ? 'Snake Order' : 'Linear Order'}
        />
        <SummaryRow
          label="Waiver System"
          value={
            state.waiverType === 'faab'
              ? `FAAB · $${state.faabBudgetDefault}`
              : 'Standard'
          }
        />
        <SummaryRow
          label="Salary Cap"
          value={state.salaryCapEnabled ? `$${state.salaryCap ?? 0}` : 'Off'}
        />
        <SummaryRow
          label="Era Filter"
          value={formatEraFilter(state.eraFilter)}
        />
        {state.selectionMethod === 'auction' && (
          <>
            <SummaryRow
              label="Auction Budget"
              value={`$${state.auctionBudget}`}
            />
            <SummaryRow label="Minimum Bid" value={`$${state.auctionMinBid}`} />
          </>
        )}
        {isFootball && (
          <>
            <SummaryRow
              label="Scoring Format"
              value={formatScoringFormat(state.scoringFormat)}
            />
            <SummaryRow
              label="Defensive Format"
              value={
                state.defensiveFormat === 'idp'
                  ? 'Individual Defensive Players (IDP)'
                  : 'Team D/ST'
              }
            />
            <XStack
              padding="$3"
              borderBottomWidth={1}
              borderColor="$surfacePanelBorder"
              flexDirection="column"
              gap="$1"
            >
              <Text fontSize={13} color="$textMuted">
                Roster Slots
              </Text>
              <Text fontSize={12} fontWeight="600" color="$color">
                {formatRosterSlots(state.rosterSlots)}
              </Text>
            </XStack>
          </>
        )}
      </YStack>

      <XStack
        pressStyle={{ opacity: 0.7 }}
        onPress={() =>
          navigate(`/${isFootball ? 'football' : 'baseball'}/league/create`)
        }
        alignItems="center"
        justifyContent="center"
        gap="$1"
        padding="$2"
        cursor="pointer"
      >
        <Text fontSize={12} color="$textMuted" textDecorationLine="underline">
          Need more options? Use the full league creation form
        </Text>
        <ExternalLink size={12} color="$textMuted" />
      </XStack>

      {error && (
        <XStack
          padding="$3"
          backgroundColor="$red2"
          borderRadius="$2"
          borderWidth={1}
          borderColor="$red6"
          gap="$2"
          alignItems="flex-start"
        >
          <AlertCircle size={16} color="$brandSeamRed" marginTop={2} />
          <Text fontSize={13} color="$red11" flex={1}>
            {error}
          </Text>
        </XStack>
      )}

      <XStack
        pressStyle={{ opacity: 0.85, scale: 0.99 }}
        onPress={loading ? undefined : onSubmit}
        backgroundColor={loading ? '$surfacePanelBorder' : '$brandGold'}
        borderRadius="$3"
        padding="$4"
        alignItems="center"
        justifyContent="center"
        cursor={loading ? 'default' : 'pointer'}
        animation="quick"
      >
        <Text
          fontSize={15}
          fontWeight="700"
          fontFamily="$heading"
          color={loading ? '$textMuted' : '$textOnGold'}
        >
          {loading ? 'Creating League…' : 'Create League'}
        </Text>
      </XStack>
    </YStack>
  );
}
