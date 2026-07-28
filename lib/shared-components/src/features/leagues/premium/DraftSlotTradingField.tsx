// DraftSlotTradingField — premium toggle for pre-draft slot trading at league
// creation (LS-8675). Locked-tap pattern (like WaiverSystemField's FAAB
// option): the toggle stays pressable for free users and enabling routes to
// `onUpgrade`, so callers can track the premium click and show their
// platform's upgrade prompt. Callers must hide (or disable) this field for
// auction leagues — auction drafts have no draft slots to trade, and the
// server rejects allowDraftSlotTrading=true for selectionMethod='auction'.
// Shared by web/mobile.

import React from 'react';
import { XStack, YStack } from 'tamagui';
import { Lock } from '@tamagui/lucide-icons';
import { LeagueFieldRow, PillToggle } from './_controls';
import { BRAND_GOLD } from '../../../utils/colors';

export interface DraftSlotTradingFieldProps {
  enabled: boolean;
  onToggleEnabled: (v: boolean) => void;
  /** Whether the viewer can enable draft slot trading. */
  isPremium: boolean;
  /** True while the viewer's entitlement is still resolving (LS-6100):
   *  neither the toggle nor the upgrade prompt fires until it settles. */
  loading?: boolean;
  disabled?: boolean;
  /** Called when a non-premium viewer tries to enable slot trading. */
  onUpgrade: () => void;
}

export function DraftSlotTradingField({
  enabled,
  onToggleEnabled,
  isPremium,
  loading = false,
  disabled = false,
  onUpgrade,
}: DraftSlotTradingFieldProps): React.JSX.Element {
  // Proactive lock affordance for confirmed-free viewers only — while the
  // entitlement is still resolving a premium user must not see a locked
  // treatment or have the upgrade prompt fired at them (LS-6100).
  const gatedFree = !isPremium && !loading;

  return (
    <YStack gap="$3">
      <LeagueFieldRow
        label="Draft Slot Trading"
        hint="Let managers propose draft position swaps before the draft starts"
      >
        <XStack alignItems="center" gap="$2">
          <PillToggle
            testID="create-league-draft-slot-trading-toggle"
            value={enabled}
            offLabel="Off"
            onLabel="On"
            onChange={(v) => {
              if (v && !isPremium) {
                if (!loading) {
                  onUpgrade();
                }
                return;
              }
              onToggleEnabled(v);
            }}
            disabled={disabled}
          />
          {gatedFree && <Lock size={12} color={BRAND_GOLD} />}
        </XStack>
      </LeagueFieldRow>
    </YStack>
  );
}
