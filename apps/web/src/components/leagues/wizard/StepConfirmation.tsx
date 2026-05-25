import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { AlertCircle } from '@tamagui/lucide-icons';
import {
  BRAND_GOLD,
  BRAND_SEAM_RED,
  PANEL_BORDER,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../../../constants/colors';
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
      borderColor={PANEL_BORDER}
      alignItems="center"
      justifyContent="space-between"
    >
      <Text fontSize={13} color={TEXT_MUTED}>
        {label}
      </Text>
      <Text fontSize={13} fontWeight="600" color={TEXT_PRIMARY}>
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

export function StepConfirmation({
  state,
  error,
  loading,
  onSubmit,
}: StepConfirmationProps) {
  const isFootball = state.sport === 'FOOTBALL';

  return (
    <YStack gap="$4">
      <YStack gap="$1">
        <Text
          fontSize={22}
          fontWeight="700"
          fontFamily="$heading"
          color={TEXT_PRIMARY}
        >
          Confirm Your League
        </Text>
        <Text fontSize={14} color={TEXT_MUTED}>
          Review your settings and create your league.
        </Text>
      </YStack>

      <YStack
        backgroundColor={SURFACE_CARD}
        borderRadius="$3"
        borderWidth={1}
        borderColor={PANEL_BORDER}
        overflow="hidden"
      >
        <SummaryRow
          label="Sport"
          value={isFootball ? '🏈 Football' : '⚾ Baseball'}
        />
        <SummaryRow label="League Name" value={state.name || '—'} />
        <SummaryRow label="Teams" value={String(state.numTeams)} />
        <SummaryRow
          label="Draft Type"
          value={state.draftType === 'snake' ? 'Snake Draft' : 'Auction Draft'}
        />
        {isFootball && (
          <>
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
              borderColor={PANEL_BORDER}
              flexDirection="column"
              gap="$1"
            >
              <Text fontSize={13} color={TEXT_MUTED}>
                Roster Slots
              </Text>
              <Text fontSize={12} fontWeight="600" color={TEXT_PRIMARY}>
                {formatRosterSlots(state.rosterSlots)}
              </Text>
            </XStack>
          </>
        )}
      </YStack>

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
          <AlertCircle size={16} color={BRAND_SEAM_RED} marginTop={2} />
          <Text fontSize={13} color="$red11" flex={1}>
            {error}
          </Text>
        </XStack>
      )}

      <XStack
        pressStyle={{ opacity: 0.85, scale: 0.99 }}
        onPress={loading ? undefined : onSubmit}
        backgroundColor={loading ? PANEL_BORDER : BRAND_GOLD}
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
          color={loading ? TEXT_MUTED : '#1B1208'}
        >
          {loading ? 'Creating League…' : 'Create League'}
        </Text>
      </XStack>
    </YStack>
  );
}
