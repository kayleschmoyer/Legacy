import React, { useState } from 'react';
import { Input, Label, Text, XStack, YStack } from 'tamagui';
import { Lock } from '@tamagui/lucide-icons/icons/Lock';
import {
  CustomEraRange,
  EraFilterGrid,
  FaabBudgetField,
  SalaryCapField,
  WaiverSystemField,
  type WaiverType,
} from '@legacy-sports/shared-components/leagues';
import type { SportChoice } from './StepSportSelect';
import { PremiumGate } from '../../PremiumGate';
import { UpgradeModal } from '../../UpgradeModal';

// Same bounds/defaults as the rich league-create form
// (apps/web/src/pages/baseball/LeagueCreatePage.tsx), independent of sport.
const AUCTION_BUDGET_RANGE = { min: 1, max: 10_000 };
const AUCTION_MIN_BID_RANGE = { min: 1, max: 10_000 };
const DEFAULT_AUCTION_BUDGET = 200;
const DEFAULT_AUCTION_MIN_BID = 1;

export interface PremiumOptions {
  selectionMethod: 'standard' | 'auction' | 'random';
  auctionBudget: number;
  auctionMinBid: number;
  waiverType: WaiverType;
  faabBudgetDefault: number;
  eraFilter: string;
  customEraStartYear?: number;
  customEraEndYear?: number;
  salaryCapEnabled: boolean;
  salaryCap?: number;
}

interface StepPremiumOptionsProps {
  sport: SportChoice;
  options: PremiumOptions;
  onChange: (options: PremiumOptions) => void;
  isPremium: boolean;
  premiumLoading: boolean;
}

const SELECTION_METHOD_OPTIONS: ReadonlyArray<{
  label: string;
  value: PremiumOptions['selectionMethod'];
}> = [
  { label: 'Standard', value: 'standard' },
  { label: 'Auction', value: 'auction' },
  { label: 'Random', value: 'random' },
];

/**
 * Locked-aware option button group. Mirrors the shared `OptionButtonGroup`
 * (lib/shared-components premium fields) and `LeagueCreatePage`'s local
 * `ButtonGroup`, kept local here since it isn't exported from the shared
 * premium-fields package.
 */
function LockableOptionGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; locked?: boolean }>;
  onChange: (v: T) => void;
}) {
  return (
    <XStack flexWrap="wrap" gap="$2">
      {options.map((opt) => {
        const selected = value === opt.value;
        const locked = !selected && opt.locked;
        const activate = () => onChange(opt.value);
        return (
          <XStack
            key={opt.value}
            testID={`premium-selection-method-${opt.value}`}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            role="button"
            aria-label={opt.label}
            tabIndex={0}
            onPress={activate}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                activate();
              }
            }}
            pressStyle={{ opacity: 0.8 }}
            padding="$3"
            flex={1}
            minWidth={100}
            gap="$1.5"
            backgroundColor={selected ? '$brandNavyLight' : '$surfaceCard'}
            borderWidth={selected ? 2 : 1}
            borderStyle={locked ? 'dashed' : 'solid'}
            borderColor={
              selected
                ? '$brandNavyLight'
                : locked
                  ? '$brandGold'
                  : '$surfacePanelBorder'
            }
            borderRadius="$2"
            cursor="pointer"
            animation="quick"
            alignItems="center"
            justifyContent="center"
          >
            {locked && <Lock size={12} color="$brandGold" />}
            <Text
              fontSize={13}
              fontWeight="600"
              color={selected ? '$textOnAccent' : '$color'}
            >
              {opt.label}
            </Text>
          </XStack>
        );
      })}
    </XStack>
  );
}

export function StepPremiumOptions({
  sport,
  options,
  onChange,
  isPremium,
  premiumLoading,
}: StepPremiumOptionsProps) {
  const [upgradeFeature, setUpgradeFeature] = useState<{
    name: string;
    description: string;
  } | null>(null);
  const gridSport = sport === 'FOOTBALL' ? 'football' : 'baseball';

  function set<K extends keyof PremiumOptions>(
    key: K,
    value: PremiumOptions[K],
  ) {
    onChange({ ...options, [key]: value });
  }

  function openUpgrade(name: string, description: string) {
    setUpgradeFeature({ name, description });
  }

  return (
    <YStack gap="$5">
      <YStack gap="$1">
        <Text
          fontSize={22}
          fontWeight="700"
          fontFamily="$heading"
          color="$color"
        >
          Premium Options
        </Text>
        <Text fontSize={14} color="$textMuted">
          Configure advanced draft, waiver, and cap settings. Some options
          require Premium.
        </Text>
      </YStack>

      <YStack gap="$2">
        <Text color="$color" fontWeight="600" fontSize={14}>
          Selection Method
        </Text>
        <LockableOptionGroup
          value={options.selectionMethod}
          options={SELECTION_METHOD_OPTIONS.map((o) => ({
            ...o,
            locked: o.value === 'auction' && (!isPremium || premiumLoading),
          }))}
          onChange={(v) => {
            if (v === 'auction' && (!isPremium || premiumLoading)) {
              openUpgrade(
                'Auction Draft',
                'Run a live auction draft where managers bid on players with a budget.',
              );
              return;
            }
            set('selectionMethod', v);
          }}
        />
        {options.selectionMethod === 'auction' && (
          <XStack gap="$4" flexWrap="wrap">
            <YStack gap="$2" flex={1} minWidth={140}>
              <Label htmlFor="auction-budget" color="$color" fontWeight="600">
                Auction Budget per Team
              </Label>
              <Input
                id="auction-budget"
                value={String(options.auctionBudget)}
                onChangeText={(text: string) => {
                  const n = parseInt(text, 10);
                  if (Number.isNaN(n)) return;
                  set(
                    'auctionBudget',
                    Math.min(
                      Math.max(n, AUCTION_BUDGET_RANGE.min),
                      AUCTION_BUDGET_RANGE.max,
                    ),
                  );
                }}
                placeholder={String(DEFAULT_AUCTION_BUDGET)}
                keyboardType="numeric"
                backgroundColor="$surfaceCard"
                borderColor="$surfacePanelBorder"
                color="$color"
              />
              <Text fontSize={12} color="$textMuted">
                {AUCTION_BUDGET_RANGE.min}–{AUCTION_BUDGET_RANGE.max}
              </Text>
            </YStack>
            <YStack gap="$2" flex={1} minWidth={140}>
              <Label htmlFor="auction-min-bid" color="$color" fontWeight="600">
                Minimum Bid
              </Label>
              <Input
                id="auction-min-bid"
                value={String(options.auctionMinBid)}
                onChangeText={(text: string) => {
                  const n = parseInt(text, 10);
                  if (Number.isNaN(n)) return;
                  set(
                    'auctionMinBid',
                    Math.min(
                      Math.max(n, AUCTION_MIN_BID_RANGE.min),
                      AUCTION_MIN_BID_RANGE.max,
                    ),
                  );
                }}
                placeholder={String(DEFAULT_AUCTION_MIN_BID)}
                keyboardType="numeric"
                backgroundColor="$surfaceCard"
                borderColor="$surfacePanelBorder"
                color="$color"
              />
              <Text fontSize={12} color="$textMuted">
                {AUCTION_MIN_BID_RANGE.min}–{AUCTION_MIN_BID_RANGE.max}
              </Text>
            </YStack>
          </XStack>
        )}
      </YStack>

      <YStack gap="$2">
        <Text color="$color" fontWeight="600" fontSize={14}>
          Historical Era Filter
        </Text>
        <EraFilterGrid
          sport={gridSport}
          value={options.eraFilter}
          onChange={(v) => set('eraFilter', v)}
          isPremium={isPremium}
          disabled={premiumLoading}
          onUpgrade={() =>
            openUpgrade(
              'Historical Era Selection',
              'Draft players from a specific era of league history.',
            )
          }
        />
        {options.eraFilter === 'custom' && (
          <CustomEraRange
            startYear={options.customEraStartYear}
            endYear={options.customEraEndYear}
            onChangeStart={(v) => set('customEraStartYear', v)}
            onChangeEnd={(v) => set('customEraEndYear', v)}
          />
        )}
      </YStack>

      <WaiverSystemField
        value={options.waiverType}
        onChange={(v) => set('waiverType', v)}
        isPremium={isPremium}
        loading={premiumLoading}
        onUpgrade={() =>
          openUpgrade(
            'FAAB Waiver Settings',
            'Configure Free Agent Acquisition Budget (FAAB) bidding for waivers.',
          )
        }
      />

      {options.waiverType === 'faab' && (
        <PremiumGate
          isPremium={isPremium}
          featureName="FAAB Waiver Settings"
          featureDescription="Configure Free Agent Acquisition Budget (FAAB) bidding — the most competitive waiver system for serious leagues."
        >
          <FaabBudgetField
            value={options.faabBudgetDefault}
            onChange={(v) => set('faabBudgetDefault', v)}
          />
        </PremiumGate>
      )}

      <PremiumGate
        isPremium={isPremium}
        featureName="Salary Cap"
        featureDescription="Track player salaries and enforce roster spending caps for a competitive salary cap league format."
      >
        <SalaryCapField
          enabled={options.salaryCapEnabled}
          amount={options.salaryCap}
          onToggleEnabled={(v) => set('salaryCapEnabled', v)}
          onAmountChange={(v) => set('salaryCap', v)}
          isPremium={isPremium && !premiumLoading}
          onUpgrade={() =>
            openUpgrade(
              'Salary Cap',
              'Track player salaries and enforce roster spending caps for a competitive salary cap league format.',
            )
          }
        />
      </PremiumGate>

      {!isPremium && !premiumLoading && (
        <XStack
          padding="$3"
          backgroundColor="$surfaceCard"
          borderRadius="$2"
          borderWidth={1}
          borderColor="$surfacePanelBorder"
        >
          <Text fontSize={12} color="$textMuted">
            Free leagues use Standard selection, Standard waivers, no salary
            cap, and All Eras. Upgrade to Premium to unlock Auction drafts, FAAB
            waivers, salary caps, and historical era filtering.
          </Text>
        </XStack>
      )}

      <UpgradeModal
        open={upgradeFeature !== null}
        onOpenChange={(open) => {
          if (!open) setUpgradeFeature(null);
        }}
        featureName={upgradeFeature?.name ?? ''}
        featureDescription={upgradeFeature?.description}
      />
    </YStack>
  );
}
