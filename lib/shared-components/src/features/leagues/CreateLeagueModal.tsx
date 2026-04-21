import React, { useEffect, useMemo, useState } from 'react';
import {
  Adapt,
  Button,
  Dialog,
  Input,
  ScrollView,
  Separator,
  Sheet,
  Text,
  VisuallyHidden,
  XStack,
  YStack,
} from 'tamagui';
import {
  AlertCircle,
  Award,
  Check,
  ChevronLeft,
  ChevronRight,
  Lock,
  ShieldCheck,
  X,
} from '@tamagui/lucide-icons';
import { Platform } from '../../platform-components';
import {
  DRAFT_MODES,
  DRAFT_ORDERS,
  PLAYER_POOLS,
  SCHEDULING_STRATEGIES,
  SELECTION_METHODS,
} from '../../config/sports';
import {
  DraftMode,
  DraftOrder,
  EraFilter,
  PlayerPool,
  SelectionMethod,
} from '../../types';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../utils/colors';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateLeagueFormData {
  leagueName: string;
  sport: 'baseball' | 'football' | 'basketball' | 'hockey';
  numberOfTeams: number;
  playerPool: PlayerPool;
  draftMode: DraftMode;
  selectionMethod: SelectionMethod;
  draftOrder: DraftOrder;
  numberOfDivisions: number;
  schedulingStrategy: 'divisional' | 'round-robin' | 'random';
  draftDate?: Date;
  // Extended fields
  isPublic: boolean;
  maxRosterSize: number;
  eraFilter: EraFilter;
  hofOnly: boolean;
  customEraStartYear?: number;
  customEraEndYear?: number;
  waiverType: 'standard' | 'faab';
  faabBudgetDefault?: number;
  salaryCapEnabled: boolean;
  salaryCap?: number;
  auctionBudget?: number;
  auctionMinBid?: number;
  draftTime?: string;
}

export interface CreateLeagueModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: CreateLeagueFormData) => Promise<void>;
  loading?: boolean;
  error?: string | null;
  isPremium?: boolean;
  sport: CreateLeagueFormData['sport'];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STEPS_ALL = [
  { id: 'basic' as const, label: 'Basics' },
  { id: 'roster' as const, label: 'Roster' },
  { id: 'era' as const, label: 'Era' },
  { id: 'draft' as const, label: 'Draft' },
  { id: 'waivers' as const, label: 'Waivers' },
];
type StepId = (typeof STEPS_ALL)[number]['id'];

const STEP_TITLES: Record<StepId, string> = {
  basic: 'Basic Settings',
  roster: 'Roster & Schedule',
  era: 'Era & History',
  draft: 'Draft Settings',
  waivers: 'Waivers, Budget & Salary Cap',
};

const STEP_SUBS: Record<StepId, string> = {
  basic:
    'Name, size, and visibility — the essentials. Everything else has a default.',
  roster: 'How the season runs and who is eligible to draft.',
  era: 'The signature control — pick a decade, a range, or the full 150 years.',
  draft: 'Set how your league drafts, and when.',
  waivers: 'In-season free-agency rules and optional cap enforcement.',
};

const ERA_OPTIONS: Array<{
  value: EraFilter;
  label: string;
  years: string;
  premium: boolean;
}> = [
  {
    value: EraFilter.ALL,
    label: 'All Eras',
    years: '1871 – Now',
    premium: false,
  },
  {
    value: EraFilter.DEAD_BALL,
    label: 'Dead Ball',
    years: '1871 – 1919',
    premium: true,
  },
  {
    value: EraFilter.GOLDEN_AGE,
    label: 'Golden Age',
    years: '1920 – 1960',
    premium: true,
  },
  {
    value: EraFilter.EXPANSION,
    label: 'Expansion',
    years: '1961 – 1976',
    premium: true,
  },
  {
    value: EraFilter.FREE_AGENCY,
    label: 'Free Agency',
    years: '1977 – 1993',
    premium: true,
  },
  {
    value: EraFilter.STEROID_ERA,
    label: 'Steroid Era',
    years: '1994 – 2005',
    premium: true,
  },
  {
    value: EraFilter.MODERN,
    label: 'Modern',
    years: '2006 – Now',
    premium: false,
  },
  {
    value: EraFilter.CUSTOM,
    label: 'Custom Range',
    years: 'Pick years',
    premium: true,
  },
];

const TEAM_COUNTS = [4, 6, 8, 10, 12, 14, 16];
const DIVISION_COUNTS = [1, 2, 3, 4];
const ROSTER_SIZES = [20, 22, 24, 26, 28, 30, 35, 40];
const FAAB_BUDGETS = [50, 100, 150, 200, 250, 500];

const DEFAULT_FORM: Omit<CreateLeagueFormData, 'sport'> = {
  leagueName: '',
  numberOfTeams: 12,
  numberOfDivisions: 2,
  playerPool: PlayerPool.ALL,
  schedulingStrategy: 'divisional',
  maxRosterSize: 26,
  eraFilter: EraFilter.ALL,
  hofOnly: false,
  customEraStartYear: undefined,
  customEraEndYear: undefined,
  draftMode: DraftMode.LIVE,
  selectionMethod: SelectionMethod.STANDARD,
  draftOrder: DraftOrder.SNAKE,
  auctionBudget: 200,
  auctionMinBid: 1,
  draftTime: '20:00',
  waiverType: 'standard',
  faabBudgetDefault: 100,
  salaryCapEnabled: false,
  salaryCap: 250,
  isPublic: false,
};

function makeDefaultForm(
  sport: CreateLeagueFormData['sport'],
): CreateLeagueFormData {
  return { ...DEFAULT_FORM, sport };
}

// ─── Design tokens ──────────────────────────────────────────────────────────

const COLORS = {
  bg: '$background',
  bgElevated: '$backgroundHover',
  bgCard: '$backgroundPress',
  outline: '$borderColor',
  outlineStrong: '$borderColorFocus',
  fg1: '$color',
  fg2: '$color11',
  fg3: '$color10',
  gold: '$yellow10',
  goldBg: '$yellow2',
  navy: '$blue10',
  navyBorder: '$blue9',
  danger: '$red10',
  dangerBg: '$red2',
  success: '$green10',
  textOnAccent: '$background',
  scorecardBg: withAlpha(BRAND_NAVY, 0.12),
  overlayModal: withAlpha(BG_DARK, 0.85),
  overlayUpgrade: 'rgba(0,0,0,0.7)',
};

// ─── Low-level components ───────────────────────────────────────────────────

function FieldLabel({
  children,
  required,
}: {
  children: string;
  required?: boolean;
}) {
  return (
    <XStack gap="$2" alignItems="center" marginBottom="$1">
      <Text
        fontSize={12}
        fontWeight="600"
        color={COLORS.fg2}
        textTransform="uppercase"
        letterSpacing={0.8}
        fontFamily="$body"
      >
        {children}
      </Text>
      {required && (
        <Text fontSize={11} color={COLORS.gold} fontFamily="$body">
          Required
        </Text>
      )}
    </XStack>
  );
}

function FieldHint({ children }: { children: string }) {
  return (
    <Text fontSize={12} color={COLORS.fg3} fontFamily="$body" marginTop="$1">
      {children}
    </Text>
  );
}

function BtnGroup<T extends string | number>({
  value,
  options,
  onChange,
  onLockedPress,
  disabled,
}: {
  value: T;
  options: Array<{ label: string; value: T; locked?: boolean }>;
  onChange: (v: T) => void;
  onLockedPress?: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <XStack flexWrap="wrap" gap={6}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Button
            key={String(opt.value)}
            size="$3"
            paddingHorizontal="$3"
            disabled={disabled}
            onPress={() => {
              if (disabled) return;
              if (opt.locked) {
                onLockedPress?.(opt.value);
              } else {
                onChange(opt.value);
              }
            }}
            backgroundColor={active ? COLORS.navy : COLORS.bgCard}
            borderColor={active ? COLORS.navyBorder : COLORS.outline}
            borderWidth={1}
            color={active ? COLORS.fg1 : opt.locked ? COLORS.fg3 : COLORS.fg2}
            fontSize={13}
            fontFamily="$body"
            pressStyle={{ opacity: 0.8 }}
            opacity={opt.locked ? 0.5 : 1}
            iconAfter={opt.locked ? Lock : undefined}
          >
            {opt.label}
          </Button>
        );
      })}
    </XStack>
  );
}

function Toggle({
  value,
  onChange,
  offLabel = 'Off',
  onLabel = 'On',
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  offLabel?: string;
  onLabel?: string;
  disabled?: boolean;
}) {
  return (
    <XStack
      gap={0}
      borderRadius="$3"
      overflow="hidden"
      borderWidth={1}
      borderColor={COLORS.outline}
      alignSelf="flex-start"
    >
      {([false, true] as const).map((v) => {
        const active = value === v;
        return (
          <Button
            key={String(v)}
            size="$3"
            paddingHorizontal="$4"
            disabled={disabled}
            onPress={() => !disabled && onChange(v)}
            backgroundColor={active ? COLORS.navy : COLORS.bgCard}
            borderWidth={0}
            borderRadius={0}
            color={active ? COLORS.fg1 : COLORS.fg2}
            fontSize={13}
            fontFamily="$body"
            pressStyle={{ opacity: 0.8 }}
          >
            {v ? onLabel : offLabel}
          </Button>
        );
      })}
    </XStack>
  );
}

function StyledInput({
  value,
  onChange,
  placeholder,
  type,
  prefix,
  disabled,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  prefix?: string;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <XStack
      borderWidth={1}
      borderColor={COLORS.outline}
      borderRadius="$3"
      backgroundColor={COLORS.bgCard}
      alignItems="center"
      overflow="hidden"
    >
      {prefix && (
        <Text
          paddingHorizontal="$3"
          color={COLORS.fg3}
          fontSize={14}
          fontFamily="$body"
          borderRightWidth={1}
          borderRightColor={COLORS.outline}
          paddingVertical="$2"
        >
          {prefix}
        </Text>
      )}
      <Input
        flex={1}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        editable={!disabled}
        maxLength={maxLength}
        backgroundColor="transparent"
        borderWidth={0}
        color={COLORS.fg1}
        placeholderTextColor={COLORS.fg3}
        fontSize={14}
        fontFamily="$body"
        paddingHorizontal="$3"
        height={40}
        keyboardType={type === 'number' ? 'numeric' : 'default'}
        {...(Platform.OS === 'web' && type ? { type } : {})}
      />
      {maxLength && (
        <Text
          paddingHorizontal="$3"
          color={value.length > maxLength * 0.9 ? COLORS.danger : COLORS.fg3}
          fontSize={11}
          fontFamily="$body"
        >
          {value.length}/{maxLength}
        </Text>
      )}
    </XStack>
  );
}

// ─── Era grid ───────────────────────────────────────────────────────────────

function EraGrid({
  value,
  onChange,
  isPremium,
  disabled,
}: {
  value: EraFilter;
  onChange: (v: EraFilter) => void;
  isPremium: boolean;
  disabled?: boolean;
}) {
  return (
    <XStack flexWrap="wrap">
      {ERA_OPTIONS.map((era) => {
        const locked = era.premium && !isPremium;
        const active = value === era.value;
        return (
          <YStack key={era.value} width="25%" padding={4}>
            <Button
              onPress={() => !disabled && onChange(era.value)}
              disabled={disabled}
              flex={1}
              height={72}
              flexDirection="column"
              alignItems="flex-start"
              justifyContent="space-between"
              padding="$3"
              backgroundColor={active ? COLORS.navy : COLORS.bgCard}
              borderColor={
                active
                  ? COLORS.navyBorder
                  : era.premium && !isPremium
                    ? withAlpha(BRAND_GOLD, 0.27)
                    : COLORS.outline
              }
              borderWidth={1}
              borderStyle={era.premium && !isPremium ? 'dashed' : 'solid'}
              borderRadius="$3"
              pressStyle={{ opacity: 0.8 }}
            >
              <XStack
                justifyContent="space-between"
                width="100%"
                alignItems="flex-start"
              >
                <Text
                  fontSize={13}
                  fontWeight="600"
                  color={locked ? COLORS.fg3 : COLORS.fg1}
                  fontFamily="$body"
                >
                  {era.label}
                </Text>
                {locked && <Lock size={10} color={COLORS.gold} />}
              </XStack>
              <Text
                fontSize={11}
                color={locked ? COLORS.fg3 : COLORS.fg2}
                fontFamily="$body"
              >
                {era.years}
              </Text>
            </Button>
          </YStack>
        );
      })}
    </XStack>
  );
}

// ─── Validation ─────────────────────────────────────────────────────────────

function validateForm(f: CreateLeagueFormData): Record<string, string> {
  const errs: Record<string, string> = {};
  const trimmedLeagueName = f.leagueName.trim();
  if (trimmedLeagueName.length < 3) {
    errs.leagueName = 'League name must be 3–50 characters.';
  } else if (trimmedLeagueName.length > 50) {
    errs.leagueName = 'League name is over 50 characters.';
  }
  if (f.numberOfTeams < 4 || f.numberOfTeams > 16)
    errs.numberOfTeams = 'Teams must be 4–16.';
  if (f.numberOfTeams % f.numberOfDivisions !== 0)
    errs.numberOfDivisions =
      'Divisions must evenly divide the number of teams.';
  if (f.maxRosterSize < 15 || f.maxRosterSize > 50)
    errs.maxRosterSize = 'Roster must be 15–50.';
  if (f.eraFilter === EraFilter.CUSTOM) {
    if (f.customEraStartYear == null || f.customEraEndYear == null)
      errs.customEra = 'Both start and end year required.';
    else if (f.customEraStartYear > f.customEraEndYear)
      errs.customEra = 'Start year must be ≤ end year.';
  }
  if (f.salaryCapEnabled && (!f.salaryCap || f.salaryCap <= 0))
    errs.salaryCap = 'Salary cap must be greater than 0.';
  if (f.selectionMethod === SelectionMethod.AUCTION) {
    if (!f.auctionBudget || f.auctionBudget <= 0)
      errs.auctionBudget = 'Auction budget must be greater than 0.';
    if (!f.auctionMinBid || f.auctionMinBid <= 0)
      errs.auctionMinBid = 'Minimum bid must be greater than 0.';
  }
  if (
    f.waiverType === 'faab' &&
    (!f.faabBudgetDefault || f.faabBudgetDefault <= 0)
  )
    errs.faabBudgetDefault = 'FAAB budget must be greater than 0.';
  return errs;
}

// ─── Step content components ────────────────────────────────────────────────

function BasicStep({
  f,
  set,
  disabled,
}: {
  f: CreateLeagueFormData;
  set: (patch: Partial<CreateLeagueFormData>) => void;
  disabled: boolean;
}) {
  return (
    <YStack gap="$4">
      <YStack gap="$1">
        <FieldLabel required>League Name</FieldLabel>
        <StyledInput
          value={f.leagueName}
          onChange={(v) => set({ leagueName: v })}
          placeholder="e.g. Dead Ball Dynasty"
          maxLength={50}
          disabled={disabled}
        />
        <FieldHint>
          3–50 characters. Shown on standings, invites, and the draft board.
        </FieldHint>
      </YStack>

      <YStack gap="$1">
        <FieldLabel>Number of Teams</FieldLabel>
        <BtnGroup
          value={f.numberOfTeams}
          options={TEAM_COUNTS.map((n) => ({ label: String(n), value: n }))}
          onChange={(v) => {
            const validDivisionCounts = DIVISION_COUNTS.filter(
              (n) => n <= v && v % n === 0,
            );
            const fallbackDivisionCount = v % 2 === 0 ? 2 : 1;
            const numberOfDivisions = validDivisionCounts.includes(
              f.numberOfDivisions,
            )
              ? f.numberOfDivisions
              : validDivisionCounts.reduce((closest, divisionCount) => {
                  const closestDistance = Math.abs(
                    closest - f.numberOfDivisions,
                  );
                  const currentDistance = Math.abs(
                    divisionCount - f.numberOfDivisions,
                  );
                  if (currentDistance !== closestDistance) {
                    return currentDistance < closestDistance
                      ? divisionCount
                      : closest;
                  }
                  return divisionCount > closest ? divisionCount : closest;
                }, validDivisionCounts[0] ?? fallbackDivisionCount);
            set({ numberOfTeams: v, numberOfDivisions });
          }}
          disabled={disabled}
        />
        <FieldHint>
          Even numbers produce cleanest divisions. 12 is the Legacy Sports
          standard.
        </FieldHint>
      </YStack>

      <YStack gap="$1">
        <FieldLabel>Divisions</FieldLabel>
        <BtnGroup
          value={f.numberOfDivisions}
          options={DIVISION_COUNTS.map((n) => ({
            label: String(n),
            value: n,
            locked: n > f.numberOfTeams || f.numberOfTeams % n !== 0,
          }))}
          onChange={(v) => set({ numberOfDivisions: v })}
          disabled={disabled}
        />
        <FieldHint>Divisions must evenly divide the team count.</FieldHint>
      </YStack>

      <YStack gap="$1">
        <FieldLabel>Visibility</FieldLabel>
        <Toggle
          value={f.isPublic}
          onChange={(v) => set({ isPublic: v })}
          offLabel="Private"
          onLabel="Public"
          disabled={disabled}
        />
        <FieldHint>
          {f.isPublic
            ? 'Anyone with the link can request to join.'
            : 'Invite-only. You control who joins.'}
        </FieldHint>
      </YStack>
    </YStack>
  );
}

function RosterStep({
  f,
  set,
  disabled,
}: {
  f: CreateLeagueFormData;
  set: (patch: Partial<CreateLeagueFormData>) => void;
  disabled: boolean;
}) {
  return (
    <YStack gap="$4">
      <YStack gap="$1">
        <FieldLabel>Scheduling Strategy</FieldLabel>
        <BtnGroup
          value={f.schedulingStrategy}
          options={SCHEDULING_STRATEGIES.map((s) => ({
            label: s.label,
            value: s.value as CreateLeagueFormData['schedulingStrategy'],
          }))}
          onChange={(v) => set({ schedulingStrategy: v })}
          disabled={disabled}
        />
        <FieldHint>
          How weekly matchups are assigned across the regular season.
        </FieldHint>
      </YStack>

      <YStack gap="$1">
        <FieldLabel>Max Roster Size</FieldLabel>
        <BtnGroup
          value={f.maxRosterSize}
          options={ROSTER_SIZES.map((n) => ({ label: String(n), value: n }))}
          onChange={(v) => set({ maxRosterSize: v })}
          disabled={disabled}
        />
        <FieldHint>Active + bench. The Legacy Sports default is 26.</FieldHint>
      </YStack>

      <YStack gap="$1">
        <FieldLabel>Player Pool</FieldLabel>
        <BtnGroup
          value={f.playerPool}
          options={PLAYER_POOLS.map((p) => ({
            label: p.label,
            value: p.value as PlayerPool,
          }))}
          onChange={(v) => set({ playerPool: v })}
          disabled={disabled}
        />
        <FieldHint>
          Narrow the league to a single league's talent, or open it up.
        </FieldHint>
      </YStack>
    </YStack>
  );
}

function EraStep({
  f,
  set,
  disabled,
  isPremium,
  onUpgrade,
}: {
  f: CreateLeagueFormData;
  set: (patch: Partial<CreateLeagueFormData>) => void;
  disabled: boolean;
  isPremium: boolean;
  onUpgrade: (feature: string) => void;
}) {
  return (
    <YStack gap="$4">
      {!isPremium && (
        <XStack
          backgroundColor={COLORS.goldBg}
          borderColor={withAlpha(BRAND_GOLD, 0.33)}
          borderWidth={1}
          borderRadius="$3"
          padding="$3"
          alignItems="center"
          gap="$3"
        >
          <YStack flex={1} gap="$1">
            <Text
              fontSize={13}
              fontWeight="700"
              color={COLORS.gold}
              fontFamily="$body"
            >
              Historical eras are premium
            </Text>
            <Text fontSize={12} color={COLORS.fg2} fontFamily="$body">
              All Eras is free. Any specific era (or HOF-only) needs Legacy
              Commissioner.
            </Text>
          </YStack>
          <Button
            size="$2"
            paddingHorizontal="$3"
            backgroundColor={COLORS.gold}
            color={COLORS.textOnAccent}
            borderWidth={0}
            fontWeight="700"
            fontSize={12}
            fontFamily="$body"
            onPress={() => onUpgrade('Historical eras')}
            pressStyle={{ opacity: 0.85 }}
          >
            Unlock
          </Button>
        </XStack>
      )}

      <YStack gap="$1">
        <FieldLabel>Era Filter</FieldLabel>
        <EraGrid
          value={f.eraFilter}
          onChange={(v) => {
            if (ERA_OPTIONS.find((e) => e.value === v)?.premium && !isPremium) {
              onUpgrade('Historical eras');
              return;
            }
            set({ eraFilter: v });
          }}
          isPremium={isPremium}
          disabled={disabled}
        />
        <FieldHint>
          Only players active during this window are draftable.
        </FieldHint>
      </YStack>

      {f.eraFilter === EraFilter.CUSTOM && (
        <XStack gap="$3">
          <YStack flex={1} gap="$1">
            <FieldLabel required>Start Year</FieldLabel>
            <StyledInput
              value={
                f.customEraStartYear != null ? String(f.customEraStartYear) : ''
              }
              onChange={(v) => {
                const n = Number(v);
                set({
                  customEraStartYear:
                    Number.isFinite(n) && v !== '' ? n : undefined,
                });
              }}
              placeholder="1920"
              type="number"
              disabled={disabled}
            />
          </YStack>
          <YStack flex={1} gap="$1">
            <FieldLabel required>End Year</FieldLabel>
            <StyledInput
              value={
                f.customEraEndYear != null ? String(f.customEraEndYear) : ''
              }
              onChange={(v) => {
                const n = Number(v);
                set({
                  customEraEndYear:
                    Number.isFinite(n) && v !== '' ? n : undefined,
                });
              }}
              placeholder="1945"
              type="number"
              disabled={disabled}
            />
          </YStack>
        </XStack>
      )}

      <YStack gap="$1">
        <FieldLabel>Hall of Fame Only</FieldLabel>
        <Toggle
          value={f.hofOnly}
          onChange={(v) => {
            if (v && !isPremium) {
              onUpgrade('Hall of Fame filter');
              return;
            }
            set({ hofOnly: v });
          }}
          disabled={disabled}
        />
        <FieldHint>
          Restrict the player pool to HOF inductees — smaller, more legendary.
        </FieldHint>
      </YStack>
    </YStack>
  );
}

function DraftStep({
  f,
  set,
  disabled,
}: {
  f: CreateLeagueFormData;
  set: (patch: Partial<CreateLeagueFormData>) => void;
  disabled: boolean;
}) {
  const autoForced = f.draftMode === DraftMode.AUTOMATED;

  return (
    <YStack gap="$4">
      <YStack gap="$1">
        <FieldLabel>Draft Mode</FieldLabel>
        <BtnGroup
          value={f.draftMode}
          options={DRAFT_MODES.map((m) => ({
            label: m.label,
            value: m.value as DraftMode,
          }))}
          onChange={(v) =>
            set({
              draftMode: v,
              selectionMethod:
                v === DraftMode.AUTOMATED
                  ? SelectionMethod.RANDOM
                  : f.selectionMethod,
            })
          }
          disabled={disabled}
        />
        <FieldHint>
          {autoForced
            ? 'Automated drafts always use random selection.'
            : 'Live drafts let managers pick in real time.'}
        </FieldHint>
      </YStack>

      <YStack gap="$1">
        <FieldLabel>Selection Method</FieldLabel>
        <BtnGroup
          value={f.selectionMethod}
          options={SELECTION_METHODS.map((s) => ({
            label: s.label,
            value: s.value as SelectionMethod,
            locked:
              autoForced &&
              (s.value as SelectionMethod) !== SelectionMethod.RANDOM,
          }))}
          onChange={(v) => set({ selectionMethod: v })}
          disabled={disabled || autoForced}
        />
        <FieldHint>
          {autoForced
            ? 'Forced to Random in automated mode.'
            : 'Auction unlocks budget bidding.'}
        </FieldHint>
      </YStack>

      <YStack gap="$1">
        <FieldLabel>Draft Order</FieldLabel>
        <BtnGroup
          value={f.draftOrder}
          options={DRAFT_ORDERS.map((o) => ({
            label: o.label,
            value: o.value as DraftOrder,
          }))}
          onChange={(v) => set({ draftOrder: v })}
          disabled={disabled}
        />
        <FieldHint>
          Snake reverses each round. Linear repeats the same order.
        </FieldHint>
      </YStack>

      <XStack gap="$3">
        <YStack flex={1} gap="$1">
          <FieldLabel>Draft Date</FieldLabel>
          <StyledInput
            value={
              f.draftDate
                ? [
                    f.draftDate.getFullYear(),
                    String(f.draftDate.getMonth() + 1).padStart(2, '0'),
                    String(f.draftDate.getDate()).padStart(2, '0'),
                  ].join('-')
                : ''
            }
            onChange={(v) => {
              if (!v) {
                set({ draftDate: undefined });
                return;
              }
              const [year, month, day] = v.split('-').map(Number);
              if (
                !Number.isFinite(year) ||
                !Number.isFinite(month) ||
                !Number.isFinite(day) ||
                month < 1 ||
                month > 12 ||
                day < 1 ||
                day > 31
              ) {
                set({ draftDate: undefined });
                return;
              }
              set({ draftDate: new Date(year, month - 1, day) });
            }}
            type="date"
            disabled={disabled}
          />
        </YStack>
        <YStack width={120} gap="$1">
          <FieldLabel>Time</FieldLabel>
          <StyledInput
            value={f.draftTime ?? '20:00'}
            onChange={(v) => set({ draftTime: v })}
            type="time"
            disabled={disabled}
          />
        </YStack>
      </XStack>

      {f.selectionMethod === SelectionMethod.AUCTION && !autoForced && (
        <XStack gap="$3">
          <YStack flex={1} gap="$1">
            <FieldLabel>Auction Budget</FieldLabel>
            <StyledInput
              value={String(f.auctionBudget ?? 200)}
              onChange={(v) => {
                const n = Number(v);
                set({
                  auctionBudget:
                    v && Number.isFinite(n) ? Math.max(1, n) : undefined,
                });
              }}
              prefix="$"
              type="number"
              disabled={disabled}
            />
            <FieldHint>Total per manager to fill a roster.</FieldHint>
          </YStack>
          <YStack flex={1} gap="$1">
            <FieldLabel>Minimum Bid</FieldLabel>
            <StyledInput
              value={String(f.auctionMinBid ?? 1)}
              onChange={(v) => {
                const n = Number(v);
                set({
                  auctionMinBid:
                    v && Number.isFinite(n) ? Math.max(1, n) : undefined,
                });
              }}
              prefix="$"
              type="number"
              disabled={disabled}
            />
            <FieldHint>Lowest opening bid accepted.</FieldHint>
          </YStack>
        </XStack>
      )}
    </YStack>
  );
}

function WaiversStep({
  f,
  set,
  disabled,
  isPremium,
  onUpgrade,
}: {
  f: CreateLeagueFormData;
  set: (patch: Partial<CreateLeagueFormData>) => void;
  disabled: boolean;
  isPremium: boolean;
  onUpgrade: (feature: string) => void;
}) {
  return (
    <YStack gap="$4">
      <YStack gap="$1">
        <FieldLabel>Waiver Type</FieldLabel>
        <BtnGroup
          value={f.waiverType}
          options={[
            { label: 'Standard', value: 'standard' as const },
            {
              label: isPremium ? 'FAAB' : 'FAAB · Premium',
              value: 'faab' as const,
              locked: !isPremium,
            },
          ]}
          onChange={(v) => set({ waiverType: v })}
          onLockedPress={() => onUpgrade('FAAB bidding')}
          disabled={disabled}
        />
        <FieldHint>
          {f.waiverType === 'faab'
            ? 'Weekly blind bidding on free agents.'
            : 'Priority-based waivers, reverse standings order.'}
        </FieldHint>
      </YStack>

      {f.waiverType === 'faab' && (
        <YStack gap="$1">
          <FieldLabel>FAAB Budget (per manager)</FieldLabel>
          <BtnGroup
            value={f.faabBudgetDefault ?? 100}
            options={FAAB_BUDGETS.map((n) => ({ label: `$${n}`, value: n }))}
            onChange={(v) => set({ faabBudgetDefault: v })}
            disabled={disabled}
          />
          <FieldHint>
            Each manager starts the season with this budget.
          </FieldHint>
        </YStack>
      )}

      <YStack gap="$1">
        <FieldLabel>Salary Cap</FieldLabel>
        <Toggle
          value={f.salaryCapEnabled}
          onChange={(v) => {
            if (v && !isPremium) {
              onUpgrade('Salary cap');
              return;
            }
            set({ salaryCapEnabled: v });
          }}
          disabled={disabled}
        />
        <FieldHint>
          {isPremium
            ? 'Keeper-style caps enforced across all teams.'
            : 'Premium feature — requires Legacy Commissioner.'}
        </FieldHint>
      </YStack>

      {f.salaryCapEnabled && (
        <YStack gap="$1">
          <FieldLabel>Cap Amount</FieldLabel>
          <StyledInput
            value={String(f.salaryCap ?? 250)}
            onChange={(v) => {
              const n = Number(v);
              set({
                salaryCap: v && Number.isFinite(n) ? Math.max(1, n) : undefined,
              });
            }}
            prefix="$"
            type="number"
            disabled={disabled}
          />
          <FieldHint>Total team salary limit, in millions.</FieldHint>
        </YStack>
      )}
    </YStack>
  );
}

// ─── Scorecard strip ────────────────────────────────────────────────────────

function Scorecard({ f }: { f: CreateLeagueFormData }) {
  const era = ERA_OPTIONS.find((e) => e.value === f.eraFilter);
  const eraLabel =
    f.eraFilter === EraFilter.CUSTOM
      ? `${f.customEraStartYear || '—'} – ${f.customEraEndYear || '—'}`
      : (era?.label ?? '—');

  return (
    <XStack
      marginTop="$3"
      padding="$3"
      backgroundColor={COLORS.scorecardBg}
      borderColor={COLORS.outline}
      borderWidth={1}
      borderRadius="$3"
      justifyContent="space-between"
      alignItems="center"
      flexWrap="wrap"
      gap="$3"
    >
      <YStack gap="$1">
        <Text
          fontSize={10}
          color={COLORS.fg3}
          textTransform="uppercase"
          letterSpacing={1}
          fontFamily="$body"
        >
          Current scorecard
        </Text>
        <Text
          fontSize={18}
          fontWeight="800"
          color={f.leagueName ? COLORS.fg1 : COLORS.fg3}
          fontFamily="$heading"
          fontStyle={f.leagueName ? 'normal' : 'italic'}
        >
          {f.leagueName || 'Untitled League'}
        </Text>
      </YStack>
      <YStack alignItems="flex-end" gap="$1">
        <Text fontSize={12} color={COLORS.fg2} fontFamily="$body">
          {f.numberOfTeams} TEAMS · {f.numberOfDivisions} DIV ·{' '}
          {eraLabel.toUpperCase()}
          {f.hofOnly ? ' · HOF' : ''}
        </Text>
        <Text fontSize={12} color={COLORS.fg2} fontFamily="$body">
          {f.draftMode.toUpperCase()} · {f.selectionMethod.toUpperCase()} ·{' '}
          {f.waiverType === 'faab'
            ? `FAAB $${f.faabBudgetDefault}`
            : 'STD WAIVERS'}
          {f.salaryCapEnabled ? ` · $${f.salaryCap}M CAP` : ''}
        </Text>
      </YStack>
    </XStack>
  );
}

// ─── Upgrade modal ──────────────────────────────────────────────────────────

function UpgradeModal({
  feature,
  onClose,
}: {
  feature: string;
  onClose: () => void;
}) {
  return (
    <Dialog modal open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          animation="quick"
          opacity={0.7}
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor={COLORS.overlayUpgrade}
        />
        <Dialog.Content
          bordered
          elevate
          backgroundColor={COLORS.bgElevated}
          borderColor={COLORS.outlineStrong}
          padding="$5"
          width={Platform.OS === 'web' ? 420 : '85%'}
          animateOnly={['transform', 'opacity']}
          animation={['quick', { opacity: { overshootClamping: true } }]}
          enterStyle={{ scale: 0.96, opacity: 0 }}
          exitStyle={{ scale: 0.96, opacity: 0 }}
          gap="$4"
        >
          <XStack alignItems="center" gap="$3">
            <YStack
              width={40}
              height={40}
              borderRadius={20}
              backgroundColor={COLORS.goldBg}
              alignItems="center"
              justifyContent="center"
            >
              <Award size={20} color={COLORS.gold} />
            </YStack>
            <YStack flex={1} gap="$1">
              <Dialog.Title
                fontSize={20}
                fontWeight="800"
                color={COLORS.fg1}
                fontFamily="$heading"
              >
                Premium feature
              </Dialog.Title>
              <Text fontSize={13} color={COLORS.fg2} fontFamily="$body">
                {feature} requires Legacy Commissioner.
              </Text>
            </YStack>
            <Dialog.Close asChild>
              <Button
                size="$2"
                circular
                backgroundColor="transparent"
                borderColor={COLORS.outline}
                borderWidth={1}
                icon={X}
                color={COLORS.fg2}
                onPress={onClose}
              />
            </Dialog.Close>
          </XStack>

          <VisuallyHidden>
            <Dialog.Description>
              Upgrade to Legacy Commissioner to unlock {feature}.
            </Dialog.Description>
          </VisuallyHidden>

          <XStack
            backgroundColor={COLORS.goldBg}
            borderColor={withAlpha(BRAND_GOLD, 0.33)}
            borderWidth={1}
            borderRadius="$3"
            padding="$3"
            gap="$3"
            alignItems="center"
          >
            <YStack flex={1} gap="$1">
              <Text
                fontSize={15}
                fontWeight="700"
                color={COLORS.gold}
                fontFamily="$heading"
              >
                $49 / season
              </Text>
              <Text fontSize={12} color={COLORS.fg2} fontFamily="$body">
                Unlimited leagues · all eras · FAAB · salary cap · keepers
              </Text>
            </YStack>
          </XStack>

          <XStack gap="$3" justifyContent="flex-end">
            <Button
              size="$3"
              variant="outlined"
              borderColor={COLORS.outline}
              color={COLORS.fg2}
              fontFamily="$body"
              onPress={onClose}
              pressStyle={{ opacity: 0.8 }}
            >
              Not now
            </Button>
            <Button
              size="$3"
              backgroundColor={COLORS.gold}
              color={COLORS.textOnAccent}
              borderWidth={0}
              fontWeight="700"
              fontFamily="$body"
              pressStyle={{ opacity: 0.85 }}
              onPress={onClose}
            >
              Unlock
            </Button>
          </XStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}

// ─── Main modal ─────────────────────────────────────────────────────────────

function CreateLeagueModal({
  visible,
  onClose,
  onSubmit,
  loading = false,
  error,
  isPremium = false,
  sport,
}: CreateLeagueModalProps) {
  const [formData, setFormData] = useState<CreateLeagueFormData>(() =>
    makeDefaultForm(sport),
  );
  const [stepId, setStepId] = useState<StepId>('basic');
  const [visited, setVisited] = useState(new Set<StepId>(['basic']));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);

  const set = (patch: Partial<CreateLeagueFormData>) =>
    setFormData((prev) => ({ ...prev, ...patch }));

  // Reset form/nav state whenever sport changes (sport-swap-while-open and initial render).
  useEffect(() => {
    setStepId('basic');
    setVisited(new Set(['basic']));
    setFormData(makeDefaultForm(sport));
  }, [sport]);

  // Clear transient UI state when modal closes.
  useEffect(() => {
    if (!visible) {
      setValidationError(null);
      setUpgradeFeature(null);
    }
  }, [visible]);

  // Coerce premium-only fields back to free defaults when isPremium flips false.
  useEffect(() => {
    if (!isPremium) {
      setFormData((prev) => {
        const isPremiumEra =
          prev.eraFilter !== EraFilter.ALL &&
          prev.eraFilter !== EraFilter.MODERN;
        return {
          ...prev,
          eraFilter: isPremiumEra ? EraFilter.ALL : prev.eraFilter,
          customEraStartYear: isPremiumEra
            ? undefined
            : prev.customEraStartYear,
          customEraEndYear: isPremiumEra ? undefined : prev.customEraEndYear,
          hofOnly: false,
          waiverType: prev.waiverType === 'faab' ? 'standard' : prev.waiverType,
          salaryCapEnabled: false,
        };
      });
    }
  }, [isPremium]);

  useEffect(() => {
    setVisited((v) => new Set([...v, stepId]));
  }, [stepId]);

  const errs = useMemo(() => validateForm(formData), [formData]);
  const disabled = loading;

  const steps = useMemo(
    () =>
      sport === 'baseball'
        ? STEPS_ALL
        : STEPS_ALL.filter((s) => s.id !== 'era'),
    [sport],
  );

  // Coerce stepId to a valid step when the steps array changes (e.g. sport switches while modal is open).
  useEffect(() => {
    const ids = new Set(steps.map((s) => s.id));
    if (!ids.has(stepId)) {
      setStepId('basic');
      setVisited((v) => new Set([...v].filter((id) => ids.has(id))));
    }
  }, [steps, stepId]);

  const stepIdx = steps.findIndex((s) => s.id === stepId);
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === steps.length - 1;

  const goNext = () => {
    if (!isLast) setStepId(steps[stepIdx + 1].id);
  };
  const goPrev = () => {
    if (!isFirst) setStepId(steps[stepIdx - 1].id);
  };

  const progress = (visited.size / steps.length) * 100;
  const canSubmit =
    Object.keys(errs).length === 0 && formData.leagueName.trim().length >= 3;
  const firstError = Object.values(errs)[0];

  const handleSubmit = async () => {
    if (!canSubmit) {
      setValidationError(firstError ?? 'Please complete all required fields.');
      return;
    }
    setValidationError(null);
    try {
      await onSubmit({
        ...formData,
        leagueName: formData.leagueName.trim(),
        sport,
      });
      setFormData(makeDefaultForm(sport));
      setStepId('basic');
      setVisited(new Set(['basic']));
    } catch {
      // Error surfaced via error prop
    }
  };

  const displayError = validationError ?? error;

  const renderStep = () => {
    switch (stepId) {
      case 'basic':
        return <BasicStep f={formData} set={set} disabled={disabled} />;
      case 'roster':
        return <RosterStep f={formData} set={set} disabled={disabled} />;
      case 'era':
        return (
          <EraStep
            f={formData}
            set={set}
            disabled={disabled}
            isPremium={isPremium}
            onUpgrade={setUpgradeFeature}
          />
        );
      case 'draft':
        return <DraftStep f={formData} set={set} disabled={disabled} />;
      case 'waivers':
        return (
          <WaiversStep
            f={formData}
            set={set}
            disabled={disabled}
            isPremium={isPremium}
            onUpgrade={setUpgradeFeature}
          />
        );
    }
  };

  return (
    <>
      <Dialog modal open={visible} onOpenChange={(open) => !open && onClose()}>
        <Adapt>
          <Sheet animation="medium" zIndex={200000} modal dismissOnSnapToBottom>
            <Sheet.Frame
              padding="$4"
              gap="$4"
              backgroundColor={COLORS.bgElevated}
            >
              <Adapt.Contents />
            </Sheet.Frame>
            <Sheet.Overlay
              animation="lazy"
              enterStyle={{ opacity: 0 }}
              exitStyle={{ opacity: 0 }}
            />
          </Sheet>
        </Adapt>

        <Dialog.Portal>
          <Dialog.Overlay
            key="overlay"
            animation="quick"
            backgroundColor={COLORS.overlayModal}
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
          <Dialog.Content
            bordered
            elevate
            key="content"
            backgroundColor={COLORS.bgElevated}
            borderColor={COLORS.outlineStrong}
            animateOnly={['transform', 'opacity']}
            animation={['quick', { opacity: { overshootClamping: true } }]}
            enterStyle={{ scale: 0.96, opacity: 0 }}
            exitStyle={{ scale: 0.97, opacity: 0 }}
            padding={0}
            width={Platform.OS === 'web' ? 640 : '95%'}
            maxHeight={Platform.OS === 'web' ? '90vh' : '90%'}
            overflow="hidden"
          >
            <VisuallyHidden>
              <Dialog.Description>
                Configure settings and draft rules to create your fantasy
                league.
              </Dialog.Description>
            </VisuallyHidden>

            {/* Header */}
            <XStack
              paddingHorizontal="$5"
              paddingVertical="$4"
              alignItems="center"
              gap="$3"
              borderBottomWidth={1}
              borderBottomColor={COLORS.outline}
            >
              <YStack
                width={36}
                height={36}
                borderRadius={8}
                backgroundColor={COLORS.bgCard}
                alignItems="center"
                justifyContent="center"
                borderWidth={1}
                borderColor={COLORS.outline}
              >
                <ShieldCheck size={18} color={COLORS.gold} />
              </YStack>
              <YStack flex={1} gap="$0.5">
                <Dialog.Title
                  fontSize={18}
                  fontWeight="800"
                  color={COLORS.fg1}
                  fontFamily="$heading"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  Create League
                </Dialog.Title>
                <Text fontSize={12} color={COLORS.fg3} fontFamily="$body">
                  Configure settings and draft rules · takes about two minutes
                </Text>
              </YStack>
              <Dialog.Close asChild>
                <Button
                  size="$2"
                  circular
                  backgroundColor="transparent"
                  borderColor={COLORS.outline}
                  borderWidth={1}
                  icon={X}
                  color={COLORS.fg2}
                  pressStyle={{ opacity: 0.8 }}
                />
              </Dialog.Close>
            </XStack>

            {/* Stepper */}
            <XStack
              paddingHorizontal="$5"
              paddingVertical="$3"
              gap="$1"
              borderBottomWidth={1}
              borderBottomColor={COLORS.outline}
              backgroundColor={COLORS.bg}
              alignItems="center"
              role="tablist"
            >
              {steps.map((s, i) => {
                const active = stepId === s.id;
                const done = visited.has(s.id) && !active;
                return (
                  <React.Fragment key={s.id}>
                    <Button
                      size="$2"
                      paddingHorizontal="$2"
                      paddingVertical="$1.5"
                      backgroundColor={active ? COLORS.navy : 'transparent'}
                      borderWidth={active ? 1 : 0}
                      borderColor={active ? COLORS.navyBorder : 'transparent'}
                      color={
                        active ? COLORS.fg1 : done ? COLORS.gold : COLORS.fg3
                      }
                      fontFamily="$body"
                      fontSize={12}
                      fontWeight={active ? '700' : '400'}
                      disabled={loading}
                      onPress={() => {
                        if (loading) return;
                        setStepId(s.id);
                      }}
                      pressStyle={{ opacity: 0.8 }}
                      role="tab"
                      aria-selected={active}
                      accessibilityRole="tab"
                      accessibilityState={{
                        selected: active,
                        disabled: loading,
                      }}
                      icon={
                        done
                          ? () => (
                              <YStack
                                width={16}
                                height={16}
                                borderRadius={8}
                                backgroundColor={COLORS.gold}
                                alignItems="center"
                                justifyContent="center"
                              >
                                <Check
                                  size={10}
                                  color={COLORS.textOnAccent}
                                  strokeWidth={3}
                                />
                              </YStack>
                            )
                          : () => (
                              <YStack
                                width={16}
                                height={16}
                                borderRadius={8}
                                backgroundColor={
                                  active ? COLORS.fg1 : COLORS.bgCard
                                }
                                borderWidth={1}
                                borderColor={
                                  active ? 'transparent' : COLORS.outline
                                }
                                alignItems="center"
                                justifyContent="center"
                              >
                                <Text
                                  fontSize={9}
                                  fontWeight="700"
                                  color={active ? COLORS.bg : COLORS.fg3}
                                >
                                  {i + 1}
                                </Text>
                              </YStack>
                            )
                      }
                    >
                      {s.label}
                    </Button>
                    {i < steps.length - 1 && (
                      <Text
                        fontSize={12}
                        color={COLORS.fg3}
                        paddingHorizontal="$1"
                      >
                        —
                      </Text>
                    )}
                  </React.Fragment>
                );
              })}
            </XStack>

            {/* Error banner */}
            {displayError && (
              <XStack
                marginHorizontal="$5"
                marginTop="$4"
                backgroundColor={COLORS.dangerBg}
                borderColor={withAlpha(BRAND_SEAM_RED, 0.33)}
                borderWidth={1}
                borderRadius="$3"
                padding="$3"
                gap="$2"
                alignItems="center"
              >
                <AlertCircle size={14} color={COLORS.danger} />
                <Text
                  fontSize={13}
                  color={COLORS.danger}
                  flex={1}
                  fontFamily="$body"
                >
                  {displayError}
                </Text>
                {validationError !== null && (
                  <Button
                    size="$2"
                    backgroundColor="transparent"
                    borderWidth={0}
                    color={COLORS.fg3}
                    paddingHorizontal="$2"
                    onPress={() => setValidationError(null)}
                    pressStyle={{ opacity: 0.8 }}
                  >
                    Dismiss
                  </Button>
                )}
              </XStack>
            )}

            {/* Body */}
            <ScrollView flex={1} showsVerticalScrollIndicator={false}>
              <YStack padding="$5" gap="$4">
                {/* Step header */}
                <YStack gap="$0.5">
                  <Text
                    fontSize={10}
                    color={COLORS.fg3}
                    textTransform="uppercase"
                    letterSpacing={1.2}
                    fontFamily="$body"
                  >
                    Step {stepIdx + 1} of {steps.length}
                  </Text>
                  <Text
                    fontSize={22}
                    fontWeight="800"
                    color={COLORS.fg1}
                    fontFamily="$heading"
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    {STEP_TITLES[stepId]}
                  </Text>
                  <Text
                    fontSize={13}
                    color={COLORS.fg2}
                    fontFamily="$body"
                    marginTop="$1"
                  >
                    {stepId === 'draft'
                      ? `Set how ${formData.leagueName || 'your league'} drafts, and when.`
                      : STEP_SUBS[stepId]}
                  </Text>
                </YStack>

                <Separator borderColor={COLORS.outline} />

                {/* Step form */}
                {renderStep()}

                {/* Scorecard */}
                <Scorecard f={formData} />
              </YStack>
            </ScrollView>

            {/* Footer */}
            <YStack
              borderTopWidth={1}
              borderTopColor={COLORS.outline}
              backgroundColor={COLORS.bg}
            >
              {/* Progress bar */}
              <YStack height={3} backgroundColor={COLORS.bgCard}>
                <YStack
                  height={3}
                  backgroundColor={COLORS.gold}
                  width={`${progress}%`}
                />
              </YStack>

              <XStack
                paddingHorizontal="$5"
                paddingVertical="$3"
                alignItems="center"
                gap="$3"
              >
                {/* Progress hint */}
                <XStack flex={1} alignItems="center" gap="$2">
                  <Text fontSize={11} color={COLORS.fg3} fontFamily="$body">
                    {visited.size}/{steps.length}
                  </Text>
                  {firstError ? (
                    <Text
                      fontSize={12}
                      color={COLORS.danger}
                      fontFamily="$body"
                      numberOfLines={1}
                      flex={1}
                    >
                      {firstError}
                    </Text>
                  ) : (
                    <Text fontSize={12} color={COLORS.fg3} fontFamily="$body">
                      Sensible defaults in place.
                    </Text>
                  )}
                </XStack>

                {/* Nav buttons */}
                {!isFirst && (
                  <Button
                    size="$3"
                    paddingHorizontal="$4"
                    backgroundColor="transparent"
                    borderColor={COLORS.outline}
                    borderWidth={1}
                    color={COLORS.fg2}
                    fontFamily="$body"
                    icon={ChevronLeft}
                    onPress={goPrev}
                    disabled={disabled}
                    pressStyle={{ opacity: 0.8 }}
                  >
                    Back
                  </Button>
                )}

                {!isLast ? (
                  <Button
                    size="$3"
                    paddingHorizontal="$4"
                    backgroundColor={COLORS.navy}
                    borderWidth={0}
                    color={COLORS.fg1}
                    fontFamily="$body"
                    fontWeight="600"
                    iconAfter={ChevronRight}
                    onPress={goNext}
                    disabled={disabled}
                    pressStyle={{ opacity: 0.8 }}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    size="$3"
                    paddingHorizontal="$4"
                    backgroundColor={canSubmit ? COLORS.navy : COLORS.bgCard}
                    borderWidth={1}
                    borderColor={canSubmit ? COLORS.navyBorder : COLORS.outline}
                    color={canSubmit ? COLORS.fg1 : COLORS.fg3}
                    fontFamily="$body"
                    fontWeight="600"
                    disabled={disabled || !canSubmit}
                    onPress={() => void handleSubmit()}
                    pressStyle={{ opacity: 0.8 }}
                    aria-label="submit-create-league"
                  >
                    {loading ? 'Creating…' : 'Create League'}
                  </Button>
                )}
              </XStack>
            </YStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      {upgradeFeature && (
        <UpgradeModal
          feature={upgradeFeature}
          onClose={() => setUpgradeFeature(null)}
        />
      )}
    </>
  );
}

export { CreateLeagueModal };
