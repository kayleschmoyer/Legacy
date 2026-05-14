import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card,
  H1,
  H2,
  Input,
  Label,
  ScrollView,
  styled,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { AlertCircle, Check, ChevronRight, Lock } from '@tamagui/lucide-icons';
import { Button, DateTimePicker } from '@legacy-sports/shared-components/ui';
import { LOGGER } from '@legacy-sports/logging';
import {
  formatDateAsUTC,
  formatDraftDate,
  getUserTimezoneLabel,
} from '../../utils/draftDateUtils';
import {
  DEFAULT_NUM_DIVISIONS,
  DEFAULT_NUM_TEAMS,
  MAX_LEAGUE_NAME_LENGTH,
} from '../../constants/league';
import { PageMeta } from '../../components/PageMeta';
import { PremiumGate } from '../../components/PremiumGate';
import { UpgradeModal } from '../../components/UpgradeModal';
import { useIsPremiumStatus } from '../../hooks/useIsPremium';
import {
  GetUserLeagues,
  GetUserLeaguesQuery,
  useCreateLeagueAndTeamsMutation,
} from '../../api/db/graphql.generated';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../constants/colors';
import { trackPremiumFeatureClick } from '../../utils/analytics';

interface CreateLeagueFormData {
  leagueName: string;
  numberOfTeams: number;
  numberOfDivisions: number;
  schedulingStrategy: 'divisional' | 'round-robin' | 'random';
  playerPool: 'all' | 'nl' | 'al';
  draftMode: 'live' | 'automated';
  selectionMethod: 'standard' | 'auction' | 'random';
  draftOrder: 'snake' | 'linear';
  maxRosterSize: number;
  draftDate?: Date;
  waiverType: 'standard' | 'faab';
  faabBudgetDefault: number;
  isPublic: boolean;
  eraFilter: string;
  hofOnly: boolean;
  customEraStartYear?: number;
  customEraEndYear?: number;
  salaryCapEnabled: boolean;
  salaryCap?: number;
  auctionBudget: number;
  auctionMinBid: number;
}

const TEAM_COUNT_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16];
const ROSTER_SIZE_OPTIONS = [20, 22, 25, 30, 35, 40];
const ALL_DIVISION_COUNT_OPTIONS = [1, 2, 3, 4];
const FAAB_BUDGET_OPTIONS = [50, 100, 150, 200, 250, 500];

const PLAYER_POOL_OPTIONS = [
  { label: 'All MLB', value: 'all' },
  { label: 'National League', value: 'nl' },
  { label: 'American League', value: 'al' },
] as const;

const DRAFT_MODE_OPTIONS = [
  { label: 'Live Draft', value: 'live' },
  { label: 'Automated Draft', value: 'automated' },
] as const;

const SELECTION_METHOD_OPTIONS = [
  { label: 'Standard', value: 'standard' },
  { label: 'Auction', value: 'auction' },
  { label: 'Random', value: 'random' },
] as const;

const DRAFT_ORDER_OPTIONS = [
  { label: 'Snake', value: 'snake' },
  { label: 'Linear', value: 'linear' },
] as const;

const SCHEDULING_STRATEGY_OPTIONS = [
  { label: 'Divisional', value: 'divisional' },
  { label: 'Round Robin', value: 'round-robin' },
  { label: 'Random', value: 'random' },
] as const;

const ERA_OPTIONS = [
  { id: 'all', name: 'All Eras', years: '1871 – Now', premium: false },
  {
    id: 'dead_ball',
    name: 'Dead Ball (pre-1920)',
    years: '1901 – 1919',
    premium: true,
  },
  { id: 'golden_age', name: 'Golden Age', years: '1920 – 1945', premium: true },
  { id: 'expansion', name: 'Expansion', years: '1946 – 1968', premium: true },
  {
    id: 'free_agency',
    name: 'Free Agency',
    years: '1969 – 1993',
    premium: true,
  },
  {
    id: 'steroid_era',
    name: 'Steroid Era',
    years: '1994 – 2005',
    premium: true,
  },
  { id: 'modern', name: 'Modern (2006+)', years: '2006 – Now', premium: false },
  { id: 'custom', name: 'Custom Era', years: 'Pick years', premium: true },
] as const;

const WAIVER_TYPE_OPTIONS = [
  { label: 'Standard', value: 'standard' },
  { label: 'FAAB  ·  Premium', value: 'faab' },
] as const;

// ── Display helpers for the summary sidebar ─────────────────────────────────

function eraDisplayLabel(f: CreateLeagueFormData): string {
  if (f.eraFilter === 'custom') {
    return `${f.customEraStartYear ?? '—'} – ${f.customEraEndYear ?? '—'}`;
  }
  return ERA_OPTIONS.find((e) => e.id === f.eraFilter)?.name ?? '—';
}

function scheduleDisplayLabel(v: string): string {
  return (
    {
      divisional: 'Divisional',
      'round-robin': 'Round-Robin',
      random: 'Random',
    }[v] ?? '—'
  );
}

function poolDisplayLabel(v: string): string {
  return (
    { all: 'All MLB', nl: 'National League', al: 'American League' }[v] ?? '—'
  );
}

// ── Validation (returns all errors, not just first) ──────────────────────────

function validateFormFull(f: CreateLeagueFormData): Record<string, string> {
  const errs: Record<string, string> = {};
  const trimmed = f.leagueName.trim();
  if (!trimmed || trimmed.length < 3)
    errs.leagueName = 'League name must be 3–50 characters.';
  if (trimmed.length > MAX_LEAGUE_NAME_LENGTH)
    errs.leagueName = `League name must be less than ${MAX_LEAGUE_NAME_LENGTH} characters`;
  if (f.numberOfTeams < 4 || f.numberOfTeams > 16)
    errs.numberOfTeams = 'Teams must be 4–16.';
  if (f.numberOfDivisions > f.numberOfTeams)
    errs.numberOfDivisions = 'More divisions than teams.';
  if (f.numberOfTeams % 2 === 1 && f.numberOfDivisions % 2 === 0)
    errs.numberOfDivisions = 'Division parity must match team parity.';
  if (f.maxRosterSize < 15 || f.maxRosterSize > 50)
    errs.maxRosterSize = 'Roster must be 15–50.';
  if (f.eraFilter === 'custom') {
    if (f.customEraStartYear == null || f.customEraEndYear == null)
      errs.customEra = 'Both start and end year required.';
    else if (f.customEraStartYear > f.customEraEndYear)
      errs.customEra = 'Start year must be ≤ end year.';
  }
  if (f.draftDate && f.draftDate < new Date())
    errs.draftDate = 'Draft date must be in the future.';
  return errs;
}

// ── Styled primitives ────────────────────────────────────────────────────────

const SectionHeader = styled(XStack, {
  paddingHorizontal: '$5',
  paddingVertical: '$4',
  alignItems: 'center',
  gap: '$4',
  backgroundColor: '$color2',
  cursor: 'pointer' as never,
  hoverStyle: { backgroundColor: '$color3' },
});

// ── CollapsibleSection ───────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  id: string;
  num: number;
  title: string;
  sub: string;
  summary?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({
  id,
  num,
  title,
  sub,
  summary,
  open,
  onToggle,
  children,
}: CollapsibleSectionProps): React.JSX.Element {
  const regionId = `create-league-section-${id}`;
  return (
    <YStack
      borderWidth={1}
      borderColor={open ? withAlpha(BRAND_NAVY_LIGHT, 0.45) : '$borderColor'}
      borderRadius="$5"
      overflow="hidden"
    >
      <SectionHeader
        data-testid={`section-toggle-${id}`}
        onPress={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={open}
        aria-controls={regionId}
        borderBottomWidth={open ? 1 : 0}
        borderBottomColor="$borderColor"
      >
        {/* Section number */}
        <Text
          fontFamily="$display"
          fontWeight="800"
          fontSize={13}
          letterSpacing={1}
          color="$brandGoldLight"
          width={28}
          flexShrink={0}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {String(num).padStart(2, '0')}
        </Text>

        {/* Title + subtitle */}
        <YStack flex={1} minWidth={0}>
          <Text
            fontFamily="$display"
            fontWeight="700"
            fontSize={19}
            color="$color"
            letterSpacing={-0.1}
          >
            {title}
          </Text>
          <Text fontFamily="$body" fontSize={13} color="$gray10" marginTop={2}>
            {sub}
          </Text>
        </YStack>

        {/* Collapsed summary */}
        {!open && summary && (
          <Text
            fontFamily="$body"
            fontSize={13}
            color="$color11"
            flexShrink={1}
            textAlign="right"
            maxWidth={260}
            marginRight="$2"
            $sm={{ display: 'none' }}
          >
            {summary}
          </Text>
        )}

        {/* Chevron */}
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            flexShrink: 0,
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        >
          <ChevronRight
            size={18}
            color={open ? withAlpha(BRAND_NAVY_LIGHT, 0.9) : '#9CAAC5'}
          />
        </span>
      </SectionHeader>

      {open && (
        <YStack
          id={regionId}
          role="region"
          aria-label={title}
          backgroundColor="$color1"
          padding="$5"
          gap="$5"
        >
          {children}
        </YStack>
      )}
    </YStack>
  );
}

// ── EraCardGrid ──────────────────────────────────────────────────────────────

interface EraCardGridProps {
  value: string;
  onChange: (v: string) => void;
  isPremium: boolean;
  disabled: boolean;
  onUpgrade: () => void;
}

function EraCardGrid({
  value,
  onChange,
  isPremium,
  disabled,
  onUpgrade,
}: EraCardGridProps): React.JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
      }}
    >
      {ERA_OPTIONS.map((era) => {
        const locked = era.premium && !isPremium;
        const selected = value === era.id;
        return (
          <button
            key={era.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (locked) {
                onUpgrade();
                return;
              }
              onChange(era.id);
            }}
            style={{
              background: selected
                ? era.premium
                  ? 'rgba(197,165,90,0.08)'
                  : withAlpha(BRAND_NAVY_LIGHT, 0.22)
                : '#0A0F1A',
              border: `1px ${locked ? 'dashed' : 'solid'} ${
                selected
                  ? era.premium
                    ? '#C5A55A'
                    : withAlpha(BRAND_NAVY_LIGHT, 0.8)
                  : '#2F3B53'
              }`,
              borderRadius: 8,
              padding: '12px 14px',
              textAlign: 'left',
              cursor: disabled ? 'not-allowed' : 'pointer',
              position: 'relative',
              minHeight: 76,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              transition:
                'border-color 150ms ease, background 150ms ease, box-shadow 150ms ease, opacity 150ms ease',
              boxShadow: selected
                ? `0 0 0 1px ${era.premium ? '#C5A55A' : withAlpha(BRAND_NAVY_LIGHT, 0.8)} inset`
                : 'none',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <span
              style={{
                fontFamily: '"Big Shoulders Display", system-ui, sans-serif',
                fontWeight: 700,
                fontSize: 14,
                color: selected
                  ? era.premium
                    ? '#D4BB78'
                    : '#F8FAFC'
                  : '#F8FAFC',
                letterSpacing: 0.1,
              }}
            >
              {era.name}
            </span>
            <span
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                color: '#9CAAC5',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {era.years}
            </span>
            {era.premium && (
              <span
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  color: '#D4BB78',
                }}
              >
                <Lock size={11} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── ButtonGroup helper ───────────────────────────────────────────────────────

interface ButtonGroupProps<T extends string | number> {
  value: T;
  options: readonly (T | { value: T; label: string; disabled?: boolean })[];
  onChange: (v: T) => void;
  disabled?: boolean;
  wide?: boolean;
}

function ButtonGroup<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  wide,
}: ButtonGroupProps<T>): React.JSX.Element {
  return (
    <XStack flexWrap="wrap" gap="$1.5">
      {options.map((o) => {
        const val = typeof o === 'object' ? o.value : o;
        const label = typeof o === 'object' ? o.label : String(o);
        const itemDisabled = disabled || (typeof o === 'object' && o.disabled);
        const selected = value === val;
        return (
          <Button
            key={String(val)}
            size="$3"
            onPress={() => !itemDisabled && onChange(val)}
            disabled={itemDisabled}
            flex={wide ? 1 : undefined}
            minWidth={44}
            backgroundColor={selected ? '$brandNavyLight' : '$color2'}
            borderColor={selected ? '$brandNavyLight' : '$borderColor'}
            borderWidth={selected ? 2 : 1}
            hoverStyle={{
              backgroundColor: selected ? '$brandNavy' : '$color3',
              borderColor: selected ? '$brandNavy' : '$borderColorHover',
            }}
            pressStyle={{ scale: 0.95 }}
          >
            <Text
              color={selected ? '$brandGold' : '$color'}
              fontWeight={selected ? '600' : '400'}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {label}
            </Text>
          </Button>
        );
      })}
    </XStack>
  );
}

// ── PillToggle (Private / Public) ────────────────────────────────────────────

interface PillToggleProps {
  value: boolean;
  offLabel: string;
  onLabel: string;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function PillToggle({
  value,
  offLabel,
  onLabel,
  onChange,
  disabled,
}: PillToggleProps): React.JSX.Element {
  return (
    <XStack
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius={9999}
      padding={3}
      width="fit-content"
    >
      {[
        { label: offLabel, v: false },
        { label: onLabel, v: true },
      ].map(({ label, v }) => {
        const selected = value === v;
        return (
          <Button
            key={label}
            size="$2"
            onPress={() => !disabled && onChange(v)}
            disabled={disabled}
            backgroundColor={selected ? '$brandNavyLight' : 'transparent'}
            borderWidth={0}
            borderRadius={9999}
            hoverStyle={{
              backgroundColor: selected ? '$brandNavy' : '$color3',
            }}
            pressStyle={{ scale: 0.97 }}
          >
            <Text
              fontFamily="$display"
              fontWeight="700"
              fontSize={12}
              letterSpacing={0.8}
              textTransform="uppercase"
              color={selected ? 'white' : '$gray10'}
            >
              {label}
            </Text>
          </Button>
        );
      })}
    </XStack>
  );
}

// ── FieldRow wrapper ─────────────────────────────────────────────────────────

interface FieldRowProps {
  label: string;
  labelId?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

function FieldRow({
  label,
  labelId,
  hint,
  required,
  children,
}: FieldRowProps): React.JSX.Element {
  return (
    <YStack gap="$2">
      <XStack gap="$2" alignItems="center">
        <Text
          id={labelId}
          fontFamily="$display"
          fontWeight="700"
          fontSize={11}
          letterSpacing={1.4}
          textTransform="uppercase"
          color="$color11"
        >
          {label}
        </Text>
        {required && (
          <Text
            fontFamily="$body"
            fontWeight="700"
            fontSize={12}
            color="$red10"
          >
            Required
          </Text>
        )}
      </XStack>
      {children}
      {hint && (
        <Text fontFamily="$body" fontSize={12} color="$gray9">
          {hint}
        </Text>
      )}
    </YStack>
  );
}

// ── SummaryRow ───────────────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  gold,
}: {
  label: string;
  value: string;
  gold?: boolean;
}): React.JSX.Element {
  return (
    <XStack
      justifyContent="space-between"
      alignItems="baseline"
      gap="$2"
      paddingVertical="$2"
      borderBottomWidth={1}
      borderBottomColor="$borderColor"
      borderStyle="dashed"
    >
      <Text
        fontFamily="$display"
        fontWeight="700"
        fontSize={11}
        letterSpacing={1}
        textTransform="uppercase"
        color="$gray9"
      >
        {label}
      </Text>
      <Text
        fontFamily="$body"
        fontWeight="600"
        fontSize={14}
        color={gold ? '$brandGoldLight' : '$color11'}
        textAlign="right"
      >
        {value}
      </Text>
    </XStack>
  );
}

// ── SummarySidePanel ─────────────────────────────────────────────────────────

interface SummarySidePanelProps {
  f: CreateLeagueFormData;
  teams: number;
}

function SummarySidePanel({
  f,
  teams,
}: SummarySidePanelProps): React.JSX.Element {
  const draftLabel = `${f.draftMode === 'live' ? 'Live' : 'Auto'} · ${
    f.selectionMethod === 'standard'
      ? 'Std'
      : f.selectionMethod === 'auction'
        ? 'Auction'
        : 'Random'
  }`;
  const waiversLabel =
    f.waiverType === 'faab' ? `FAAB · $${f.faabBudgetDefault}` : 'Standard';

  return (
    <>
      {/* League summary card */}
      <Card
        size="$4"
        bordered
        backgroundColor="$color2"
        borderColor="$borderColor"
        padding="$5"
        gap="$4"
      >
        <XStack justifyContent="space-between" alignItems="center">
          <Text
            fontFamily="$display"
            fontWeight="700"
            fontSize={12}
            letterSpacing={1.4}
            textTransform="uppercase"
            color="$brandGoldLight"
          >
            Your League
          </Text>
          <Text
            fontFamily="$display"
            fontWeight="700"
            fontSize={11}
            letterSpacing={1.2}
            textTransform="uppercase"
            paddingHorizontal="$2.5"
            paddingVertical="$1"
            borderRadius={9999}
            backgroundColor="rgba(255,255,255,0.04)"
            borderWidth={1}
            borderColor="$borderColor"
            color="$gray9"
          >
            Draft
          </Text>
        </XStack>

        <YStack gap="$1">
          <H2
            fontFamily="$display"
            fontWeight={f.leagueName ? '800' : '400'}
            fontSize={22}
            color={f.leagueName ? '$color' : '$gray9'}
            fontStyle={f.leagueName ? 'normal' : 'italic'}
          >
            {f.leagueName || 'Untitled League'}
          </H2>
          <Text fontFamily="$body" fontSize={13} color="$gray9" marginTop={4}>
            {eraDisplayLabel(f)} · {f.numberOfTeams} teams ·{' '}
            {f.isPublic ? 'Public' : 'Private'}
          </Text>
        </YStack>

        <YStack>
          <SummaryRow label="Teams" value={String(f.numberOfTeams)} />
          <SummaryRow label="Divisions" value={String(f.numberOfDivisions)} />
          <SummaryRow
            label="Schedule"
            value={scheduleDisplayLabel(f.schedulingStrategy)}
          />
          <SummaryRow label="Roster" value={`${f.maxRosterSize} players`} />
          <SummaryRow label="Pool" value={poolDisplayLabel(f.playerPool)} />
          <SummaryRow
            label="Era"
            value={eraDisplayLabel(f)}
            gold={f.eraFilter !== 'all'}
          />
          {f.hofOnly && <SummaryRow label="HOF Only" value="On" gold />}
          <SummaryRow label="Draft" value={draftLabel} />
          <SummaryRow label="Waivers" value={waiversLabel} />
          {f.salaryCapEnabled && (
            <SummaryRow label="Cap" value={`$${f.salaryCap ?? 0}M`} gold />
          )}
        </YStack>
      </Card>

      {/* What happens next card */}
      <Card
        size="$4"
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.08)}
        borderColor={withAlpha('#C5A55A', 0.22)}
        borderWidth={1}
        padding="$5"
        gap="$3"
      >
        <Text
          fontFamily="$display"
          fontWeight="700"
          fontSize={12}
          letterSpacing={1.4}
          textTransform="uppercase"
          color="$brandGoldLight"
        >
          What happens next?
        </Text>
        <YStack gap="$2.5">
          {[
            "Your league is created and you're set as Commissioner.",
            `Send invite links to up to ${teams - 1} managers.`,
            `Draft opens ${formatDraftDate(f.draftDate)}.`,
            'Tune lineups, settings, and waivers right up to first pitch.',
          ].map((item) => (
            <XStack key={item} gap="$2.5" alignItems="flex-start">
              <YStack
                width={6}
                height={6}
                borderRadius={3}
                backgroundColor="$brandGold"
                marginTop={7}
                flexShrink={0}
              />
              <Text
                fontFamily="$body"
                fontSize={13}
                color="$color11"
                lineHeight={22}
                flex={1}
              >
                {item}
              </Text>
            </XStack>
          ))}
        </YStack>
      </Card>
    </>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function LeagueCreatePage(): React.JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isPremium, isLoading: premiumLoading } = useIsPremiumStatus();
  const [showWaiverUpgradeModal, setShowWaiverUpgradeModal] = useState(false);
  const [showEraUpgradeModal, setShowEraUpgradeModal] = useState(false);

  const [formData, setFormData] = useState<CreateLeagueFormData>(() => {
    const initialLeagueName = (searchParams.get('name') ?? '')
      .trim()
      .slice(0, MAX_LEAGUE_NAME_LENGTH);
    return {
      leagueName: initialLeagueName,
      numberOfTeams: DEFAULT_NUM_TEAMS,
      numberOfDivisions: DEFAULT_NUM_DIVISIONS,
      schedulingStrategy: 'divisional',
      playerPool: 'all',
      draftMode: 'live',
      selectionMethod: 'standard',
      draftOrder: 'snake',
      maxRosterSize: 25,
      draftDate: undefined,
      waiverType: 'standard',
      faabBudgetDefault: 100,
      isPublic: false,
      eraFilter: 'all',
      hofOnly: false,
      salaryCapEnabled: false,
      salaryCap: undefined,
      auctionBudget: 200,
      auctionMinBid: 1,
    };
  });

  // Collapsible section state
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(['basic']),
  );
  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const expandAll = useCallback(() => {
    setOpenSections(
      new Set([
        'basic',
        'roster-schedule',
        'era-history',
        'draft',
        'waiver-budget',
      ]),
    );
  }, []);
  const collapseAll = useCallback(() => {
    setOpenSections(new Set(['basic']));
  }, []);

  const [createLeagueAndTeams, { loading }] = useCreateLeagueAndTeamsMutation({
    update: (cache, { data }) => {
      if (data?.createLeagueAndTeams?.league) {
        const newLeague = data.createLeagueAndTeams.league;
        try {
          const existingData = cache.readQuery<GetUserLeaguesQuery>({
            query: GetUserLeagues,
          });
          if (existingData?.userLeagues) {
            cache.writeQuery({
              query: GetUserLeagues,
              data: { userLeagues: [...existingData.userLeagues, newLeague] },
            });
          }
        } catch (error) {
          LOGGER.info(
            'Cache read failed, will refetch queries instead:',
            String(error),
          );
        }
      }
    },
    refetchQueries: [{ query: GetUserLeagues }],
  });

  const handleInputChange = (
    field: keyof CreateLeagueFormData,
    value: string | number | boolean | Date | undefined,
  ) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'draftMode' && value === 'automated') {
        next.selectionMethod = 'random';
      }
      if (
        field === 'numberOfTeams' &&
        typeof value === 'number' &&
        value % 2 === 1 &&
        next.numberOfDivisions % 2 === 0
      ) {
        next.numberOfDivisions = 1;
      }
      return next;
    });
  };

  const validationErrors = useMemo(
    () => validateFormFull(formData),
    [formData],
  );
  const errorCount = Object.keys(validationErrors).length;
  const firstError = errorCount > 0 ? Object.values(validationErrors)[0] : null;

  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if ((!isPremium || premiumLoading) && formData.waiverType === 'faab') {
      trackPremiumFeatureClick('FAAB Waiver Settings');
      setShowWaiverUpgradeModal(true);
      return;
    }
    if (
      (!isPremium || premiumLoading) &&
      formData.eraFilter !== 'all' &&
      formData.eraFilter !== 'modern'
    ) {
      trackPremiumFeatureClick('Historical Era Selection');
      setShowEraUpgradeModal(true);
      return;
    }
    if (errorCount > 0) {
      setSubmitError(firstError);
      return;
    }

    try {
      const trimmedLeagueName = formData.leagueName.trim();
      const result = await createLeagueAndTeams({
        errorPolicy: 'none',
        context: { suppressGlobalError: true },
        variables: {
          input: {
            leagueName: trimmedLeagueName,
            numberOfTeams: formData.numberOfTeams,
            numberOfDivisions: formData.numberOfDivisions,
            schedulingStrategy: formData.schedulingStrategy,
            playerPool: formData.playerPool,
            draftMode: formData.draftMode,
            selectionMethod: formData.selectionMethod,
            draftOrder: formData.draftOrder,
            maxRosterSize: formData.maxRosterSize,
            startDate: formData.draftDate
              ? formData.draftDate.toISOString()
              : undefined,
            isPublic: formData.isPublic,
            tradingEnabled: true,
            waiverEnabled: true,
            waiverType: formData.waiverType,
            faabBudgetDefault: formData.faabBudgetDefault,
            eraFilter: formData.eraFilter,
            hofOnly: formData.hofOnly,
            customEraStartYear:
              formData.eraFilter === 'custom'
                ? formData.customEraStartYear
                : undefined,
            customEraEndYear:
              formData.eraFilter === 'custom'
                ? formData.customEraEndYear
                : undefined,
            salaryCapEnabled: formData.salaryCapEnabled,
            salaryCap: formData.salaryCapEnabled
              ? formData.salaryCap
              : undefined,
            auctionBudget:
              formData.selectionMethod === 'auction'
                ? formData.auctionBudget
                : undefined,
            auctionMinBid:
              formData.selectionMethod === 'auction'
                ? formData.auctionMinBid
                : undefined,
          },
        },
      });

      if (result.data?.createLeagueAndTeams?.league?.id) {
        navigate(
          `/baseball/league/${result.data.createLeagueAndTeams.league.id}`,
        );
      }
    } catch (error) {
      LOGGER.error(
        'Error creating league:',
        error instanceof Error ? error : String(error),
      );
      setSubmitError(
        (error as Error).message ||
          'Unable to save league. Your settings are still filled in — try again or come back later.',
      );
    }
  };

  const isFormDisabled = loading;

  return (
    <ScrollView flex={1} backgroundColor="$background">
      <PageMeta
        title="Create a League"
        description="Start your own fantasy baseball league on Legacy Sports. Customize draft settings, roster rules, and invite friends to compete."
      />

      <YStack
        padding="$6"
        $sm={{ padding: '$4', paddingBottom: '$8' }}
        maxWidth={1200}
        alignSelf="center"
        width="100%"
        gap="$6"
      >
        {/* ── Page header ── */}
        <XStack
          justifyContent="space-between"
          alignItems="flex-end"
          gap="$4"
          flexWrap="wrap"
        >
          <YStack gap="$1">
            <Text
              fontFamily="$display"
              fontWeight="700"
              fontSize={12}
              letterSpacing={1.4}
              textTransform="uppercase"
              color="$brandGoldLight"
            >
              Baseball · New League
            </Text>
            <H1
              fontFamily="$display"
              fontWeight="800"
              fontSize="$10"
              color="$color"
              letterSpacing={-0.5}
              $sm={{ fontSize: '$8' }}
            >
              Create Baseball League
            </H1>
            <Text
              fontFamily="$body"
              fontSize={17}
              color="$color11"
              lineHeight={27}
              marginTop="$1"
              maxWidth={600}
            >
              Configure your league settings and draft rules. You can adjust
              everything except team count after the draft.
            </Text>
          </YStack>

          <XStack gap="$2" alignSelf="flex-end">
            <Button
              size="$2"
              variant="outlined"
              onPress={expandAll}
              disabled={isFormDisabled}
            >
              Expand all
            </Button>
            <Button
              size="$2"
              variant="outlined"
              onPress={collapseAll}
              disabled={isFormDisabled}
            >
              Collapse
            </Button>
          </XStack>
        </XStack>

        {/* ── Submit error banner ── */}
        {submitError && (
          <XStack
            role="alert"
            aria-live="assertive"
            gap="$3"
            alignItems="flex-start"
            backgroundColor="rgba(176,46,68,0.22)"
            borderWidth={1}
            borderColor="rgba(176,46,68,0.55)"
            borderRadius="$4"
            padding="$4"
          >
            <YStack
              width={28}
              height={28}
              borderRadius={14}
              backgroundColor="rgba(196,30,58,0.2)"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
            >
              <AlertCircle size={14} color="#E07A8C" />
            </YStack>
            <YStack flex={1}>
              <Text
                fontFamily="$display"
                fontWeight="700"
                fontSize={13}
                letterSpacing={0.4}
                textTransform="uppercase"
                color="#E07A8C"
              >
                Unable to save league
              </Text>
              <Text
                fontFamily="$body"
                fontSize={14}
                color="$color11"
                marginTop={2}
              >
                {submitError}
              </Text>
            </YStack>
            <Button
              size="$2"
              variant="outlined"
              onPress={() => setSubmitError(null)}
            >
              Dismiss
            </Button>
          </XStack>
        )}

        {/* ── Two-column layout ── */}
        <XStack
          gap="$6"
          alignItems="flex-start"
          $lg={{ flexDirection: 'column' }}
        >
          {/* ── Main form column ── */}
          <YStack flex={1} minWidth={0} gap="$4">
            <form
              onSubmit={(e) => {
                void handleSubmit(e);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              {/* ── Section 1: Basic Settings ── */}
              <CollapsibleSection
                id="basic"
                num={1}
                title="Basic Settings"
                sub="The essentials — name, size, and who gets in."
                summary={
                  <span>
                    <strong>{formData.numberOfTeams}</strong> teams ·{' '}
                    {formData.numberOfDivisions} div
                    {formData.numberOfDivisions > 1 ? 's' : ''} ·{' '}
                    {formData.isPublic ? 'Public' : 'Private'}
                  </span>
                }
                open={openSections.has('basic')}
                onToggle={() => toggleSection('basic')}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 22,
                  }}
                >
                  {/* League Name — full width */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FieldRow
                      label="League Name"
                      labelId="league-name-label"
                      required
                      hint="3–50 characters. Shown on standings, invites, and the draft board."
                    >
                      <Input
                        id="league-name-input"
                        aria-labelledby="league-name-label"
                        size="$4"
                        testID="create-league-name-input"
                        placeholder="Enter your league name"
                        value={formData.leagueName}
                        onChangeText={(text: string) =>
                          handleInputChange('leagueName', text)
                        }
                        borderColor={
                          validationErrors.leagueName ? '$red8' : '$borderColor'
                        }
                        backgroundColor="$color1"
                        disabled={isFormDisabled}
                        aria-required="true"
                        maxLength={MAX_LEAGUE_NAME_LENGTH + 5}
                      />
                    </FieldRow>
                  </div>

                  {/* Number of Teams */}
                  <FieldRow
                    label="Number of Teams"
                    required
                    hint={
                      formData.numberOfTeams % 2 === 1
                        ? 'Teams are odd — divisions must also be odd.'
                        : 'Even numbers produce cleanest divisions. 12 is standard.'
                    }
                  >
                    <ButtonGroup
                      value={formData.numberOfTeams}
                      options={TEAM_COUNT_OPTIONS}
                      onChange={(v) => handleInputChange('numberOfTeams', v)}
                      disabled={isFormDisabled}
                    />
                  </FieldRow>

                  {/* Divisions */}
                  <FieldRow
                    label="Number of Divisions"
                    hint="How many divisions to split your teams into"
                  >
                    <ButtonGroup
                      value={formData.numberOfDivisions}
                      options={ALL_DIVISION_COUNT_OPTIONS.filter(
                        (d) =>
                          d <= formData.numberOfTeams &&
                          formData.numberOfTeams % 2 === d % 2,
                      )}
                      onChange={(v) =>
                        handleInputChange('numberOfDivisions', v)
                      }
                      disabled={isFormDisabled}
                    />
                  </FieldRow>

                  {/* Visibility — full width */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FieldRow
                      label="League Visibility"
                      hint={
                        formData.isPublic
                          ? 'Anyone can browse and join this league'
                          : 'Only people with your invite code can join'
                      }
                    >
                      <PillToggle
                        value={formData.isPublic}
                        offLabel="🔒 Private"
                        onLabel="🌐 Public"
                        onChange={(v) => handleInputChange('isPublic', v)}
                        disabled={isFormDisabled}
                      />
                    </FieldRow>
                  </div>
                </div>
              </CollapsibleSection>

              {/* ── Section 2: Roster & Schedule ── */}
              <CollapsibleSection
                id="roster-schedule"
                num={2}
                title="Roster & Schedule"
                sub="How the season runs and what the rosters look like."
                summary={
                  <span>
                    {scheduleDisplayLabel(formData.schedulingStrategy)} ·{' '}
                    {formData.maxRosterSize} roster ·{' '}
                    {poolDisplayLabel(formData.playerPool)}
                  </span>
                }
                open={openSections.has('roster-schedule')}
                onToggle={() => toggleSection('roster-schedule')}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 22,
                  }}
                >
                  {/* Scheduling Strategy — full width */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FieldRow
                      label="Scheduling Strategy"
                      hint="Divisional schedules prioritize in-division matchups"
                    >
                      <ButtonGroup
                        value={formData.schedulingStrategy}
                        options={SCHEDULING_STRATEGY_OPTIONS.map((o) => ({
                          value: o.value,
                          label: o.label,
                        }))}
                        onChange={(v) =>
                          handleInputChange('schedulingStrategy', v)
                        }
                        disabled={isFormDisabled}
                        wide
                      />
                    </FieldRow>
                  </div>

                  {/* Max Roster Size */}
                  <FieldRow
                    label="Max Roster Size"
                    hint="Number of players each team can have"
                  >
                    <ButtonGroup
                      value={formData.maxRosterSize}
                      options={ROSTER_SIZE_OPTIONS}
                      onChange={(v) => handleInputChange('maxRosterSize', v)}
                      disabled={isFormDisabled}
                    />
                  </FieldRow>

                  {/* Player Pool */}
                  <FieldRow
                    label="Player Pool"
                    hint="Which players can be drafted"
                  >
                    <ButtonGroup
                      value={formData.playerPool}
                      options={PLAYER_POOL_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      }))}
                      onChange={(v) => handleInputChange('playerPool', v)}
                      disabled={isFormDisabled}
                    />
                  </FieldRow>
                </div>
              </CollapsibleSection>

              {/* ── Section 3: Era & History ── */}
              <CollapsibleSection
                id="era-history"
                num={3}
                title="Era & History"
                sub="The signature Legacy Sports control — which decades are in play."
                summary={
                  <span>
                    <strong>{eraDisplayLabel(formData)}</strong>
                    {formData.hofOnly ? ' · HOF only' : ''}
                  </span>
                }
                open={openSections.has('era-history')}
                onToggle={() => toggleSection('era-history')}
              >
                {/* Premium upsell banner */}
                {!isPremium && (
                  <XStack
                    gap="$3"
                    alignItems="center"
                    backgroundColor="rgba(197,165,90,0.08)"
                    borderWidth={1}
                    borderColor="rgba(197,165,90,0.35)"
                    borderRadius="$4"
                    padding="$4"
                  >
                    <YStack
                      width={36}
                      height={36}
                      borderRadius={18}
                      backgroundColor="rgba(197,165,90,0.2)"
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                    >
                      <Text fontSize={16}>
                        <span role="img" aria-label="trophy">
                          🏆
                        </span>
                      </Text>
                    </YStack>
                    <YStack flex={1}>
                      <Text
                        fontFamily="$display"
                        fontWeight="700"
                        fontSize={13}
                        letterSpacing={0.8}
                        textTransform="uppercase"
                        color="$brandGoldLight"
                      >
                        Historical eras are premium
                      </Text>
                      <Text
                        fontFamily="$body"
                        fontSize={13}
                        color="$color11"
                        marginTop={2}
                      >
                        All Eras is free. Pick a specific era or
                        Hall-of-Fame-only pool with Legacy Commissioner.
                      </Text>
                    </YStack>
                    <Button
                      size="$2"
                      onPress={() => {
                        trackPremiumFeatureClick('Historical Era Selection');
                        setShowEraUpgradeModal(true);
                      }}
                      backgroundColor="$brandGold"
                      borderWidth={0}
                    >
                      <Text color="#111" fontWeight="700" fontSize={13}>
                        Unlock
                      </Text>
                    </Button>
                  </XStack>
                )}

                <FieldRow
                  label="Historical Era Filter"
                  hint="Only players active during this window are draftable."
                >
                  <EraCardGrid
                    value={formData.eraFilter}
                    onChange={(v) => handleInputChange('eraFilter', v)}
                    isPremium={!!isPremium && !premiumLoading}
                    disabled={isFormDisabled}
                    onUpgrade={() => {
                      trackPremiumFeatureClick('Historical Era Selection');
                      setShowEraUpgradeModal(true);
                    }}
                  />
                </FieldRow>

                {/* Custom era year range */}
                {formData.eraFilter === 'custom' && (
                  <XStack gap="$3" alignItems="flex-end" flexWrap="wrap">
                    <YStack flex={1} gap="$2">
                      <Label
                        htmlFor="era-start"
                        paddingVertical={0}
                        height="auto"
                      >
                        <Text
                          fontFamily="$display"
                          fontWeight="700"
                          fontSize={11}
                          letterSpacing={1.4}
                          textTransform="uppercase"
                          color="$color11"
                        >
                          Start Year
                        </Text>
                      </Label>
                      <Input
                        id="era-start"
                        size="$3"
                        testID="create-league-era-start-input"
                        placeholder="e.g. 1940"
                        value={
                          formData.customEraStartYear !== undefined
                            ? String(formData.customEraStartYear)
                            : ''
                        }
                        onChangeText={(text: string) => {
                          const year = parseInt(text, 10);
                          handleInputChange(
                            'customEraStartYear',
                            isNaN(year) ? undefined : year,
                          );
                        }}
                        keyboardType="numeric"
                        disabled={isFormDisabled}
                        borderColor={
                          validationErrors.customEra
                            ? '$red8'
                            : '$brandNavyLight'
                        }
                      />
                    </YStack>
                    <Text color="$gray9" marginBottom="$3">
                      –
                    </Text>
                    <YStack flex={1} gap="$2">
                      <Label
                        htmlFor="era-end"
                        paddingVertical={0}
                        height="auto"
                      >
                        <Text
                          fontFamily="$display"
                          fontWeight="700"
                          fontSize={11}
                          letterSpacing={1.4}
                          textTransform="uppercase"
                          color="$color11"
                        >
                          End Year
                        </Text>
                      </Label>
                      <Input
                        id="era-end"
                        size="$3"
                        testID="create-league-era-end-input"
                        placeholder="e.g. 1960"
                        value={
                          formData.customEraEndYear !== undefined
                            ? String(formData.customEraEndYear)
                            : ''
                        }
                        onChangeText={(text: string) => {
                          const year = parseInt(text, 10);
                          handleInputChange(
                            'customEraEndYear',
                            isNaN(year) ? undefined : year,
                          );
                        }}
                        keyboardType="numeric"
                        disabled={isFormDisabled}
                        borderColor={
                          validationErrors.customEra
                            ? '$red8'
                            : '$brandNavyLight'
                        }
                      />
                    </YStack>
                  </XStack>
                )}

                {/* HOF Only */}
                <FieldRow
                  label="Hall of Fame Draft Mode"
                  hint="Restrict the player pool to HOF inductees — smaller, more legendary."
                >
                  <PillToggle
                    value={formData.hofOnly}
                    offLabel="🏆 Hall of Famers Only — OFF"
                    onLabel="🏆 Hall of Famers Only — ON"
                    onChange={(v) => handleInputChange('hofOnly', v)}
                    disabled={isFormDisabled}
                  />
                </FieldRow>
              </CollapsibleSection>

              {/* ── Section 4: Draft Settings ── */}
              <CollapsibleSection
                id="draft"
                num={4}
                title="Draft Settings"
                sub="Live or automated, snake or linear — and when it all kicks off."
                summary={
                  <span>
                    {formData.draftMode === 'live' ? 'Live' : 'Automated'} ·{' '}
                    {formData.selectionMethod} · {formData.draftOrder}
                  </span>
                }
                open={openSections.has('draft')}
                onToggle={() => toggleSection('draft')}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 22,
                  }}
                >
                  {/* Draft Mode */}
                  <FieldRow
                    label="Draft Mode"
                    hint={
                      formData.draftMode === 'automated'
                        ? 'Automated drafts use random player assignment'
                        : 'Live drafts require all managers online'
                    }
                  >
                    <ButtonGroup
                      value={formData.draftMode}
                      options={DRAFT_MODE_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      }))}
                      onChange={(v) => handleInputChange('draftMode', v)}
                      disabled={isFormDisabled}
                    />
                  </FieldRow>

                  {/* Selection Method */}
                  <FieldRow
                    label="Selection Method"
                    hint={
                      formData.draftMode === 'automated'
                        ? 'Forced to Random in automated mode.'
                        : 'Standard picks in order, auction bidding'
                    }
                  >
                    <ButtonGroup
                      value={formData.selectionMethod}
                      options={SELECTION_METHOD_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      }))}
                      onChange={(v) => handleInputChange('selectionMethod', v)}
                      disabled={
                        isFormDisabled || formData.draftMode === 'automated'
                      }
                    />
                  </FieldRow>

                  {/* Draft Order */}
                  <FieldRow
                    label="Draft Order"
                    hint="Snake order reverses each round"
                  >
                    <ButtonGroup
                      value={formData.draftOrder}
                      options={DRAFT_ORDER_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      }))}
                      onChange={(v) => handleInputChange('draftOrder', v)}
                      disabled={isFormDisabled}
                    />
                  </FieldRow>

                  {/* Draft Date */}
                  <FieldRow
                    label="Draft Date & Time"
                    hint="Optional. Leave blank to schedule later from league settings."
                  >
                    <>
                      <DateTimePicker
                        value={formData.draftDate}
                        onChange={(date: Date) =>
                          handleInputChange('draftDate', date)
                        }
                        onClear={() =>
                          setFormData((prev) => ({
                            ...prev,
                            draftDate: undefined,
                          }))
                        }
                        placeholder="Select draft date and time"
                        disabled={isFormDisabled}
                        minDate={new Date()}
                        useNativeInput={false}
                      />
                      {formData.draftDate ? (
                        <YStack gap="$1">
                          <Text
                            fontFamily="$body"
                            fontSize={12}
                            color="$gray10"
                          >
                            Local: {formatDraftDate(formData.draftDate)} —{' '}
                            {getUserTimezoneLabel()}
                          </Text>
                          <Text
                            fontFamily="$body"
                            fontSize={12}
                            color="$gray10"
                          >
                            UTC: {formatDateAsUTC(formData.draftDate)}
                          </Text>
                        </YStack>
                      ) : (
                        <Text fontFamily="$body" fontSize={12} color="$gray10">
                          Times shown in {getUserTimezoneLabel()}
                        </Text>
                      )}
                    </>
                  </FieldRow>

                  {/* Auction settings — conditional */}
                  {formData.selectionMethod === 'auction' &&
                    formData.draftMode !== 'automated' && (
                      <>
                        <FieldRow
                          label="Auction Budget per Team"
                          hint="Total dollars each manager has to fill a roster."
                        >
                          <Input
                            size="$3"
                            value={String(formData.auctionBudget)}
                            onChangeText={(text: string) => {
                              const n = parseInt(text, 10);
                              handleInputChange(
                                'auctionBudget',
                                isNaN(n) ? 200 : n,
                              );
                            }}
                            placeholder="200"
                            keyboardType="numeric"
                            disabled={isFormDisabled}
                          />
                        </FieldRow>
                        <FieldRow
                          label="Minimum Bid"
                          hint="Lowest opening bid accepted."
                        >
                          <Input
                            size="$3"
                            value={String(formData.auctionMinBid)}
                            onChangeText={(text: string) => {
                              const n = parseInt(text, 10);
                              handleInputChange(
                                'auctionMinBid',
                                isNaN(n) ? 1 : n,
                              );
                            }}
                            placeholder="1"
                            keyboardType="numeric"
                            disabled={isFormDisabled}
                          />
                        </FieldRow>
                      </>
                    )}
                </div>
              </CollapsibleSection>

              {/* ── Section 5: Waivers, Budget & Salary Cap ── */}
              <CollapsibleSection
                id="waiver-budget"
                num={5}
                title="Waivers, Budget & Salary Cap"
                sub="In-season free-agent rules and optional cap enforcement."
                summary={
                  <span>
                    {formData.waiverType === 'faab'
                      ? `FAAB · $${formData.faabBudgetDefault}`
                      : 'Standard waivers'}
                    {formData.salaryCapEnabled
                      ? ` · $${formData.salaryCap ?? 0}M cap`
                      : ''}
                  </span>
                }
                open={openSections.has('waiver-budget')}
                onToggle={() => toggleSection('waiver-budget')}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 22,
                  }}
                >
                  {/* Waiver Type — full width */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FieldRow
                      label="Waiver System"
                      hint={
                        formData.waiverType === 'faab'
                          ? 'FAAB: weekly blind bidding on free agents.'
                          : 'Teams have a priority order'
                      }
                    >
                      <ButtonGroup
                        value={formData.waiverType}
                        options={WAIVER_TYPE_OPTIONS.map((o) => ({
                          value: o.value,
                          label: o.label,
                        }))}
                        onChange={(v) => {
                          if (v === 'faab' && (!isPremium || premiumLoading)) {
                            trackPremiumFeatureClick('FAAB Waiver Settings');
                            setShowWaiverUpgradeModal(true);
                            return;
                          }
                          handleInputChange('waiverType', v);
                        }}
                        disabled={isFormDisabled}
                        wide
                      />
                    </FieldRow>
                  </div>

                  {/* FAAB Budget (conditional) */}
                  {formData.waiverType === 'faab' && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <PremiumGate
                        isPremium={isPremium}
                        featureName="FAAB Waiver Settings"
                        featureDescription="Configure Free Agent Acquisition Budget (FAAB) bidding — the most competitive waiver system for serious leagues."
                      >
                        <FieldRow
                          label="FAAB Budget (per manager)"
                          hint="Each manager starts the season with this budget."
                        >
                          <ButtonGroup
                            value={formData.faabBudgetDefault}
                            options={FAAB_BUDGET_OPTIONS.map((v) => ({
                              value: v,
                              label: `$${v}`,
                            }))}
                            onChange={(v) =>
                              handleInputChange('faabBudgetDefault', v)
                            }
                            disabled={isFormDisabled}
                          />
                        </FieldRow>
                      </PremiumGate>
                    </div>
                  )}

                  {/* Salary Cap — full width */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <PremiumGate
                      isPremium={isPremium}
                      featureName="Salary Cap"
                      featureDescription="Track player salaries and enforce roster spending caps for a competitive salary cap league format."
                    >
                      <YStack gap="$3">
                        <FieldRow
                          label="Enable Salary Cap"
                          hint="Track player salaries and enforce roster spending limits"
                        >
                          <PillToggle
                            value={formData.salaryCapEnabled}
                            offLabel="Off"
                            onLabel="On"
                            onChange={(v) => {
                              if (v && (!isPremium || premiumLoading)) {
                                trackPremiumFeatureClick('Salary Cap');
                                setShowWaiverUpgradeModal(true);
                                return;
                              }
                              handleInputChange('salaryCapEnabled', v);
                            }}
                            disabled={isFormDisabled}
                          />
                        </FieldRow>

                        {formData.salaryCapEnabled && (
                          <FieldRow
                            label="Salary Cap Limit"
                            hint="Maximum total salary each team can spend"
                          >
                            <Input
                              size="$3"
                              value={
                                formData.salaryCap !== undefined
                                  ? String(formData.salaryCap)
                                  : ''
                              }
                              onChangeText={(text: string) => {
                                const n = parseInt(text, 10);
                                handleInputChange(
                                  'salaryCap',
                                  isNaN(n) ? 0 : n,
                                );
                              }}
                              placeholder="e.g. 50000000"
                              keyboardType="numeric"
                              disabled={isFormDisabled}
                            />
                          </FieldRow>
                        )}
                      </YStack>
                    </PremiumGate>
                  </div>
                </div>
              </CollapsibleSection>

              {/* ── Sticky action bar ── */}
              <XStack
                justifyContent="space-between"
                alignItems="center"
                gap="$4"
                padding="$4"
                paddingHorizontal="$5"
                backgroundColor="$color2"
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$5"
                flexWrap="wrap"
                $sm={{ flexDirection: 'column', alignItems: 'flex-start' }}
              >
                {/* Validation status */}
                <XStack gap="$2" alignItems="center" flex={1}>
                  {errorCount === 0 ? (
                    <>
                      <Check size={14} color="#6FD39A" />
                      <Text fontFamily="$body" fontSize={13} color="#6FD39A">
                        All settings look good.
                      </Text>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={14} color="#E07A8C" />
                      <Text fontFamily="$body" fontSize={13} color="#E07A8C">
                        {errorCount} item{errorCount > 1 ? 's' : ''} need
                        attention · {firstError}
                      </Text>
                    </>
                  )}
                </XStack>

                <XStack gap="$2">
                  <Button
                    size="$4"
                    variant="outlined"
                    onPress={() => navigate('/baseball')}
                    disabled={isFormDisabled}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="$4"
                    variant="primary"
                    type="submit"
                    data-testid="create-league-submit"
                    disabled={isFormDisabled}
                  >
                    {loading ? 'Creating...' : 'Create League'}
                  </Button>
                </XStack>
              </XStack>
            </form>
          </YStack>

          {/* ── Sticky sidebar ── */}
          <YStack
            width={340}
            gap="$4"
            flexShrink={0}
            $lg={{ width: '100%' }}
            style={{ position: 'sticky', top: 80 }}
          >
            <SummarySidePanel f={formData} teams={formData.numberOfTeams} />
          </YStack>
        </XStack>
      </YStack>

      <UpgradeModal
        open={showWaiverUpgradeModal}
        onOpenChange={setShowWaiverUpgradeModal}
        featureName="FAAB Waiver Settings"
        featureDescription="Use Free Agent Acquisition Budget (FAAB) bidding for waiver claims, where the highest bid wins."
      />
      <UpgradeModal
        open={showEraUpgradeModal}
        onOpenChange={setShowEraUpgradeModal}
        featureName="Historical Era Selection"
        featureDescription="Unlock all historical eras to restrict your league's player pool — Dead Ball, Golden Age, Expansion, and more."
      />
    </ScrollView>
  );
}

export default LeagueCreatePage;
