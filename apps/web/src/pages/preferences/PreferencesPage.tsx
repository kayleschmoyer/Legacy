import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Paragraph,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  Bell,
  Check,
  ChevronDown,
  LogIn,
  Minus,
  Plus,
  SunMoon,
  Trophy,
} from '@tamagui/lucide-icons';
import { ScrollView, Spinner, styled } from 'tamagui';
import { PageMeta } from '../../components/PageMeta';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  withAlpha,
} from '../../constants/colors';
import { useThemeContext } from '../../context/ThemeContext';
import {
  GetUserNotificationPreferences,
  type GetUserNotificationPreferencesQuery,
  useGetUserNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
} from '../../api/db/graphql.generated';

/* ─── Brand typography ─── */

const FONT_DISPLAY = "'Big Shoulders Display', 'Oswald', system-ui, sans-serif";

/* ─── Storage keys ─── */

const PREFS_STORAGE_KEY = 'ls_user_preferences';
const COLLAPSED_SECTIONS_KEY = 'ls_prefs_sections_collapsed';

/* ─── Types ─── */

type ThemePreference = 'system' | 'light' | 'dark';
type DefaultSportView = 'baseball' | 'football';
type StatsFormat = 'standard' | 'expanded';

interface UserPreferences {
  theme: ThemePreference;
  defaultSport: DefaultSportView;
  statsFormat: StatsFormat;
  showSeasonTotals: boolean;
  enableAnimations: boolean;
}

const DEFAULT_PREFS: UserPreferences = {
  theme: 'system',
  defaultSport: 'baseball',
  statsFormat: 'standard',
  showSeasonTotals: true,
  enableAnimations: true,
};

const CLOSE_GAME_MIN = 1;
const CLOSE_GAME_MAX = 200;
const CLOSE_GAME_DEFAULT = 50;

function loadPrefs(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return {
      ...DEFAULT_PREFS,
      ...(JSON.parse(raw) as Partial<UserPreferences>),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: UserPreferences): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Best-effort persistence; ignore storage errors (private mode, quota).
  }
}

function clampCloseGame(n: number): number {
  if (Number.isNaN(n)) return CLOSE_GAME_DEFAULT;
  return Math.min(CLOSE_GAME_MAX, Math.max(CLOSE_GAME_MIN, Math.round(n)));
}

/* ─── Collapsible section helpers ─── */

type SectionId = 'appearance' | 'sports' | 'notifications';

const DEFAULT_COLLAPSED: Record<SectionId, boolean> = {
  appearance: false,
  sports: false,
  notifications: false,
};

function loadCollapsedSections(): Record<SectionId, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
    if (!raw) return { ...DEFAULT_COLLAPSED };
    return {
      ...DEFAULT_COLLAPSED,
      ...(JSON.parse(raw) as Partial<Record<SectionId, boolean>>),
    };
  } catch {
    return { ...DEFAULT_COLLAPSED };
  }
}

function persistCollapsedSections(sections: Record<SectionId, boolean>): void {
  try {
    localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(sections));
  } catch {
    // Best-effort persistence; ignore storage errors (private mode, quota).
  }
}

/* ─── Styled Components ─── */

const PageContainer = styled(YStack, {
  flex: 1,
  minHeight: '100vh',
  backgroundColor: '$background',
  paddingBottom: '$10',
});

const ContentContainer = styled(YStack, {
  maxWidth: 800,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$5',
  gap: '$4',
  $sm: {
    paddingHorizontal: '$3',
    gap: '$3',
  },
});

const PageHeader = styled(YStack, {
  paddingVertical: '$8',
  gap: '$2',
  $sm: {
    paddingVertical: '$6',
  },
});

const SectionCard = styled(YStack, {
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$glassBorder',
  overflow: 'hidden',
});

const SectionHeader = styled(XStack, {
  paddingHorizontal: '$5',
  paddingVertical: '$4',
  alignItems: 'center',
  gap: '$3',
  cursor: 'pointer',
  userSelect: 'none',
  minHeight: 56,
  hoverStyle: { opacity: 0.85 },
  pressStyle: { opacity: 0.75 },
  focusStyle: {
    outlineWidth: 2,
    outlineColor: '$brandNavyLight',
    outlineStyle: 'solid',
  },
  variants: {
    expanded: {
      true: {
        borderBottomWidth: 1,
        borderBottomColor: '$glassBorder',
      },
      false: {},
    },
  } as const,
  defaultVariants: { expanded: true },
});

const sectionToggleA11yProps = {
  role: 'button' as const,
  tabIndex: 0,
};

const SectionIconBox = styled(YStack, {
  width: 36,
  height: 36,
  borderRadius: '$3',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$accentMuted',
  borderWidth: 1,
  borderColor: '$glassBorder',
});

const SectionBody = styled(YStack, {
  padding: '$5',
  gap: '$5',
  $sm: {
    padding: '$4',
  },
});

const PrefRow = styled(XStack, {
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '$4',
  minHeight: 56,
  $sm: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '$2',
  },
});

const PrefLabel = styled(YStack, {
  gap: '$1',
  flex: 1,
});

const ToggleTrack = styled(YStack, {
  width: 48,
  height: 26,
  borderRadius: '$10',
  justifyContent: 'center',
  paddingHorizontal: '$1',
  cursor: 'pointer',
  animation: 'quick',
  variants: {
    active: {
      true: { backgroundColor: '$brandNavy' },
      false: { backgroundColor: '$color4' },
    },
  } as const,
  defaultVariants: { active: false },
});

const ToggleThumb = styled(YStack, {
  width: 20,
  height: 20,
  borderRadius: '$10',
  backgroundColor: 'white',
  animation: 'quick',
  shadowColor: '$shadowColor',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.2,
  shadowRadius: 2,
  elevation: 2,
  variants: {
    active: {
      true: { alignSelf: 'flex-end' },
      false: { alignSelf: 'flex-start' },
    },
  } as const,
  defaultVariants: { active: false },
});

const SegmentedRow = styled(XStack, {
  borderRadius: '$10',
  borderWidth: 1,
  borderColor: '$glassBorder',
  backgroundColor: '$color2',
  padding: 3,
  gap: 2,
  alignSelf: 'flex-start',
});

const SegmentedButton = styled(YStack, {
  paddingHorizontal: '$3',
  paddingVertical: '$1.5',
  borderRadius: '$10',
  cursor: 'pointer',
  animation: 'quick',
  alignItems: 'center',
  justifyContent: 'center',
  variants: {
    selected: {
      true: { backgroundColor: '$brandNavy' },
      false: { backgroundColor: 'transparent' },
    },
  } as const,
  defaultVariants: { selected: false },
  hoverStyle: { opacity: 0.85 },
  pressStyle: { scale: 0.97 },
});

/* Theme picker — three large tactile cards. The choice is qualitative
   (not on/off), so we surface previews as deliberate options rather
   than a chip group. */
const ThemePickGrid = styled(XStack, {
  gap: '$2',
  flexWrap: 'wrap',
  $sm: {
    flexDirection: 'column',
    alignSelf: 'stretch',
    width: '100%',
  },
});

const ThemeCard = styled(YStack, {
  width: 96,
  borderRadius: '$4',
  borderWidth: 1,
  padding: '$2',
  gap: '$2',
  alignItems: 'center',
  cursor: 'pointer',
  animation: 'quick',
  $sm: {
    width: '100%',
    flexDirection: 'row',
    paddingHorizontal: '$3',
  },
  variants: {
    selected: {
      true: {
        borderColor: '$brandGold',
        backgroundColor: 'rgba(197, 165, 90, 0.06)',
      },
      false: {
        borderColor: '$glassBorder',
        backgroundColor: '$color2',
      },
    },
  } as const,
  defaultVariants: { selected: false },
  hoverStyle: { borderColor: '$brandGoldLight' },
  pressStyle: { scale: 0.97 },
});

const ThemeSwatch = styled(YStack, {
  width: '100%',
  height: 44,
  borderRadius: '$2',
  borderWidth: 1,
  borderColor: '$glassBorder',
  overflow: 'hidden',
  $sm: {
    width: 64,
    height: 36,
    flexShrink: 0,
  },
});

/* Stepper for closeGameThreshold */
const StepperRow = styled(XStack, {
  alignSelf: 'stretch',
  borderRadius: '$4',
  borderWidth: 1,
  borderColor: '$glassBorder',
  backgroundColor: '$color2',
  overflow: 'hidden',
  alignItems: 'stretch',
  height: 44,
});

const StepperButton = styled(YStack, {
  width: 44,
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  animation: 'quick',
  hoverStyle: { backgroundColor: '$color3' },
  pressStyle: { backgroundColor: '$color4', scale: 0.97 },
  focusStyle: {
    outlineWidth: 2,
    outlineColor: '$brandNavyLight',
    outlineStyle: 'solid',
    outlineOffset: -2,
  },
  variants: {
    disabled: {
      true: { opacity: 0.4, cursor: 'not-allowed' },
      false: {},
    },
  } as const,
  defaultVariants: { disabled: false },
});

const StepperValue = styled(YStack, {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  borderLeftWidth: 1,
  borderRightWidth: 1,
  borderColor: '$glassBorder',
  flexDirection: 'row',
  gap: 4,
});

/* Save banner — bottom-center, brand-gold tick, display-font label.
   Wrapper is the fixed-position centering shell; inner pill carries
   the chrome. Keeps the banner out of document flow so changing prefs
   doesn't shift page content (LS-3100). */
const SaveBannerWrap = styled(XStack, {
  position: 'fixed' as const,
  left: 0,
  right: 0,
  bottom: 24,
  justifyContent: 'center',
  pointerEvents: 'none',
  zIndex: 1000,
});

const SaveBanner = styled(XStack, {
  alignItems: 'center',
  gap: '$2.5',
  paddingVertical: '$2.5',
  paddingHorizontal: '$4',
  borderRadius: '$10',
  borderWidth: 1,
  borderColor: '$brandGold',
  backgroundColor: '$background',
  shadowColor: '$shadowColor',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.35,
  shadowRadius: 18,
  elevation: 12,
  pointerEvents: 'auto',
});

const SaveBannerTick = styled(YStack, {
  width: 22,
  height: 22,
  borderRadius: 11,
  backgroundColor: '$brandGold',
  alignItems: 'center',
  justifyContent: 'center',
});

/* ─── Background style helpers ─── */

function getPageBackgroundStyle(isDark: boolean): React.CSSProperties {
  return {
    background: isDark
      ? `
          radial-gradient(ellipse at 15% 0%, ${withAlpha(BRAND_NAVY, 0.16)} 0%, transparent 50%),
          radial-gradient(ellipse at 85% 5%, ${withAlpha(BRAND_GOLD, 0.06)} 0%, transparent 45%)
        `
      : `
          radial-gradient(ellipse at 15% 0%, ${withAlpha(BRAND_NAVY, 0.06)} 0%, transparent 50%),
          radial-gradient(ellipse at 85% 5%, ${withAlpha(BRAND_GOLD, 0.04)} 0%, transparent 45%)
        `,
    backgroundAttachment: 'fixed',
  };
}

function getCardStyle(isDark: boolean, navyStop = 100): React.CSSProperties {
  return isDark
    ? {
        background: `linear-gradient(135deg, ${BG_DARK} 0%, ${BRAND_NAVY} ${navyStop}%)`,
      }
    : {
        background: `linear-gradient(135deg, #FFFFFF 0%, ${withAlpha(BRAND_NAVY, 0.06)} ${navyStop}%)`,
      };
}

function getSystemSwatchStyle(): React.CSSProperties {
  return {
    background: 'linear-gradient(90deg, #0A0F1A 50%, #F5F7FA 50%)',
  };
}

function getLightSwatchStyle(): React.CSSProperties {
  return { background: '#F5F7FA' };
}

function getDarkSwatchStyle(): React.CSSProperties {
  return {
    background: `linear-gradient(135deg, #0A0F1A 30%, ${withAlpha(BRAND_NAVY, 0.45)} 100%)`,
  };
}

/* ─── Sub-components ─── */

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Paragraph
      size="$1"
      color="$brandGoldLight"
      fontFamily={FONT_DISPLAY}
      fontWeight="700"
      letterSpacing={2}
      textTransform="uppercase"
    >
      {children}
    </Paragraph>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Paragraph
      size="$5"
      color="$color"
      fontFamily={FONT_DISPLAY}
      fontWeight="700"
      letterSpacing={0.2}
    >
      {children}
    </Paragraph>
  );
}

function SectionMeta({ children }: { children: React.ReactNode }) {
  return (
    <Paragraph size="$2" color="$colorPress" numberOfLines={1}>
      {children}
    </Paragraph>
  );
}

function CollapseChevron({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <YStack
      animation="quick"
      style={{
        transform: `rotate(${isCollapsed ? -90 : 0}deg)`,
        transition: 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
    >
      <ChevronDown size={20} color="$colorPress" />
    </YStack>
  );
}

function CollapsibleBody({
  isCollapsed,
  children,
}: {
  isCollapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden={isCollapsed}
      // `inert` removes the subtree from the accessibility tree AND from
      // sequential focus navigation, so collapsed content isn't tab-stop
      // reachable for assistive tech. Cast handles React typings that
      // don't yet expose the attribute on every DOM element.
      {...((isCollapsed
        ? { inert: '' }
        : {}) as React.HTMLAttributes<HTMLDivElement>)}
      style={{
        display: 'grid',
        gridTemplateRows: isCollapsed ? '0fr' : '1fr',
        transition: 'grid-template-rows 0.3s ease-out',
      }}
    >
      <div
        style={{
          overflow: 'hidden',
          minHeight: 0,
          visibility: isCollapsed ? 'hidden' : 'visible',
          pointerEvents: isCollapsed ? 'none' : 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function onToggleKeyDown(
  toggle: () => void,
): React.KeyboardEventHandler<Element> {
  return (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };
}

interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}

function PrefToggle({ value, onChange, label, description }: ToggleProps) {
  return (
    <PrefRow>
      <PrefLabel>
        <Paragraph size="$4" color="$color" fontWeight="600">
          {label}
        </Paragraph>
        {description ? (
          <Paragraph size="$3" color="$colorPress">
            {description}
          </Paragraph>
        ) : null}
      </PrefLabel>
      <ToggleTrack
        active={value}
        onPress={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        aria-label={label}
      >
        <ToggleThumb active={value} />
      </ToggleTrack>
    </PrefRow>
  );
}

/* Roving-tabindex keyboard navigation for a `role="radiogroup"` whose
   children are `role="radio"`. Returns helpers to wire each radio button:
   only the selected radio is tab-stop; arrow keys move focus AND selection,
   matching ARIA APG radio-group pattern. Home/End jump to ends. */
function useRadioGroupNav<T extends string>(
  values: readonly T[],
  selected: T,
  onChange: (next: T) => void,
) {
  const refs = React.useRef<Array<HTMLElement | null>>([]);
  const selectedIndex = Math.max(0, values.indexOf(selected));

  const focusAt = (i: number) => {
    const node = refs.current[i];
    if (node) node.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const last = values.length - 1;
    let nextIdx: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIdx = selectedIndex === last ? 0 : selectedIndex + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIdx = selectedIndex === 0 ? last : selectedIndex - 1;
        break;
      case 'Home':
        nextIdx = 0;
        break;
      case 'End':
        nextIdx = last;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(values[nextIdx]);
    // Focus after React commits the new selected state.
    requestAnimationFrame(() => focusAt(nextIdx));
  };

  return {
    radioProps: (value: T, idx: number) => ({
      ref: (node: HTMLElement | null) => {
        refs.current[idx] = node;
      },
      tabIndex: value === selected ? 0 : -1,
      onKeyDown: handleKeyDown,
    }),
  };
}

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  testIdPrefix?: string;
  ariaLabel: string;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  testIdPrefix,
  ariaLabel,
}: SegmentedProps<T>) {
  const values = options.map((o) => o.value);
  const { radioProps } = useRadioGroupNav<T>(values, value, onChange);
  return (
    <SegmentedRow role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt, idx) => {
        const selected = value === opt.value;
        return (
          <SegmentedButton
            key={opt.value}
            data-testid={
              testIdPrefix ? `${testIdPrefix}-${opt.value}` : undefined
            }
            selected={selected}
            onPress={() => onChange(opt.value)}
            role="radio"
            aria-checked={selected}
            {...radioProps(opt.value, idx)}
          >
            <Paragraph
              fontFamily={FONT_DISPLAY}
              fontWeight="700"
              fontSize={11}
              letterSpacing={1.2}
              textTransform="uppercase"
              color={selected ? 'white' : '$colorPress'}
            >
              {opt.label}
            </Paragraph>
          </SegmentedButton>
        );
      })}
    </SegmentedRow>
  );
}

/* Theme picker — qualitative options shown as preview cards rather than chips. */
function ThemePicker({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (v: ThemePreference) => void;
}) {
  const cards: Array<{
    value: ThemePreference;
    label: string;
    swatchStyle: React.CSSProperties;
  }> = [
    { value: 'system', label: 'System', swatchStyle: getSystemSwatchStyle() },
    { value: 'light', label: 'Light', swatchStyle: getLightSwatchStyle() },
    { value: 'dark', label: 'Dark', swatchStyle: getDarkSwatchStyle() },
  ];
  const values = cards.map((c) => c.value);
  const { radioProps } = useRadioGroupNav<ThemePreference>(
    values,
    value,
    onChange,
  );
  return (
    <ThemePickGrid role="radiogroup" aria-label="Theme">
      {cards.map((c, idx) => {
        const selected = value === c.value;
        return (
          <ThemeCard
            key={c.value}
            selected={selected}
            onPress={() => onChange(c.value)}
            role="radio"
            aria-checked={selected}
            aria-label={`${c.label} theme`}
            data-testid={`theme-card-${c.value}`}
            {...radioProps(c.value, idx)}
          >
            <ThemeSwatch style={c.swatchStyle} />
            <Paragraph
              fontFamily={FONT_DISPLAY}
              fontWeight="700"
              fontSize={11}
              letterSpacing={1.2}
              textTransform="uppercase"
              color={selected ? '$brandGoldLight' : '$colorPress'}
            >
              {c.label}
            </Paragraph>
          </ThemeCard>
        );
      })}
    </ThemePickGrid>
  );
}

/* Number stepper for closeGameThreshold — ±1 / ±10 buttons flanking a
   tabular value. Tabular figures keep the number stable as it ticks. */
function ThresholdStepper({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  ariaLabel: string;
}) {
  const atMin = value <= CLOSE_GAME_MIN;
  const atMax = value >= CLOSE_GAME_MAX;
  const step = (delta: number) => {
    const next = clampCloseGame(value + delta);
    if (next !== value) onChange(next);
  };
  return (
    <StepperRow role="group" aria-label={ariaLabel}>
      <StepperButton
        onPress={() => step(-10)}
        disabled={atMin}
        aria-label="Decrease by 10"
        aria-disabled={atMin}
      >
        <Paragraph
          fontFamily={FONT_DISPLAY}
          fontWeight="800"
          fontSize={20}
          color="$color"
        >
          −
        </Paragraph>
      </StepperButton>
      <StepperButton
        onPress={() => step(-1)}
        disabled={atMin}
        aria-label="Decrease by 1"
        aria-disabled={atMin}
      >
        <Minus size={16} color="$color" />
      </StepperButton>
      <StepperValue>
        <Paragraph
          fontFamily={FONT_DISPLAY}
          fontWeight="800"
          fontSize={20}
          color="$color"
          style={{ fontVariantNumeric: 'tabular-nums' }}
          aria-live="polite"
        >
          {value}
        </Paragraph>
        <Paragraph size="$2" color="$colorPress">
          pts
        </Paragraph>
      </StepperValue>
      <StepperButton
        onPress={() => step(1)}
        disabled={atMax}
        aria-label="Increase by 1"
        aria-disabled={atMax}
      >
        <Plus size={16} color="$color" />
      </StepperButton>
      <StepperButton
        onPress={() => step(10)}
        disabled={atMax}
        aria-label="Increase by 10"
        aria-disabled={atMax}
      >
        <Paragraph
          fontFamily={FONT_DISPLAY}
          fontWeight="800"
          fontSize={20}
          color="$color"
        >
          +
        </Paragraph>
      </StepperButton>
    </StepperRow>
  );
}

/* ─── Notification Preferences (authenticated) ─── */

function NotificationPreferencesSection({
  cardStyle,
  isDark,
  isCollapsed,
  onToggleCollapse,
  onSaved,
}: {
  cardStyle: React.CSSProperties;
  isDark: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSaved: () => void;
}) {
  const { data, loading, error, refetch } =
    useGetUserNotificationPreferencesQuery();
  const [updatePrefs] = useUpdateNotificationPreferencesMutation();

  const prefs = data?.getUserNotificationPreferences;

  const optimistic = useCallback(
    (
      patch: Partial<{
        matchupStartedEnabled: boolean;
        matchupEndedEnabled: boolean;
        matchupCloseGameEnabled: boolean;
        matchupReminderEnabled: boolean;
        pushEnabled: boolean;
        emailEnabled: boolean;
        closeGameThreshold: number;
      }>,
    ) => ({
      __typename: 'NotificationPreference' as const,
      id: prefs?.id ?? 0,
      userId: prefs?.userId ?? 0,
      matchupStartedEnabled: prefs?.matchupStartedEnabled ?? true,
      matchupEndedEnabled: prefs?.matchupEndedEnabled ?? true,
      matchupCloseGameEnabled: prefs?.matchupCloseGameEnabled ?? true,
      matchupReminderEnabled: prefs?.matchupReminderEnabled ?? true,
      pushEnabled: prefs?.pushEnabled ?? true,
      emailEnabled: prefs?.emailEnabled ?? false,
      closeGameThreshold: prefs?.closeGameThreshold ?? CLOSE_GAME_DEFAULT,
      createdAt: prefs?.createdAt ?? '',
      updatedAt: new Date().toISOString(),
      ...patch,
    }),
    [prefs],
  );

  type NotificationToggleField =
    | 'matchupStartedEnabled'
    | 'matchupEndedEnabled'
    | 'matchupCloseGameEnabled'
    | 'matchupReminderEnabled'
    | 'pushEnabled'
    | 'emailEnabled';

  const handleToggle = useCallback(
    (field: NotificationToggleField, value: boolean) => {
      void updatePrefs({
        variables: { input: { [field]: value } },
        optimisticResponse: {
          __typename: 'Mutation',
          updateNotificationPreferences: optimistic({ [field]: value }),
        },
        update(cache, { data: mutationData }) {
          if (mutationData?.updateNotificationPreferences) {
            cache.writeQuery<GetUserNotificationPreferencesQuery>({
              query: GetUserNotificationPreferences,
              data: {
                __typename: 'Query',
                getUserNotificationPreferences:
                  mutationData.updateNotificationPreferences,
              },
            });
          }
        },
      });
      onSaved();
    },
    [updatePrefs, optimistic, onSaved],
  );

  const handleThresholdChange = useCallback(
    (next: number) => {
      const safe = clampCloseGame(next);
      void updatePrefs({
        variables: { input: { closeGameThreshold: safe } },
        optimisticResponse: {
          __typename: 'Mutation',
          updateNotificationPreferences: optimistic({
            closeGameThreshold: safe,
          }),
        },
        update(cache, { data: mutationData }) {
          if (mutationData?.updateNotificationPreferences) {
            cache.writeQuery<GetUserNotificationPreferencesQuery>({
              query: GetUserNotificationPreferences,
              data: {
                __typename: 'Query',
                getUserNotificationPreferences:
                  mutationData.updateNotificationPreferences,
              },
            });
          }
        },
      });
      onSaved();
    },
    [updatePrefs, optimistic, onSaved],
  );

  const headerNode = (meta: React.ReactNode) => (
    <SectionHeader
      expanded={!isCollapsed}
      onPress={onToggleCollapse}
      onKeyDown={onToggleKeyDown(onToggleCollapse)}
      {...sectionToggleA11yProps}
      aria-expanded={!isCollapsed}
    >
      <SectionIconBox>
        <Bell size={18} color="$brandGoldLight" strokeWidth={1.8} />
      </SectionIconBox>
      <YStack flex={1} gap={2}>
        <SectionTitle>Notifications</SectionTitle>
        {meta}
      </YStack>
      <CollapseChevron isCollapsed={isCollapsed} />
    </SectionHeader>
  );

  if (loading) {
    return (
      <SectionCard style={cardStyle}>
        {headerNode(<SectionMeta>Loading…</SectionMeta>)}
        <CollapsibleBody isCollapsed={isCollapsed}>
          <SectionBody>
            <XStack justifyContent="center" padding="$4">
              <Spinner
                size="small"
                color={isDark ? BRAND_GOLD_LIGHT : BRAND_NAVY}
              />
            </XStack>
          </SectionBody>
        </CollapsibleBody>
      </SectionCard>
    );
  }

  if (error && !loading) {
    return (
      <SectionCard style={cardStyle}>
        {headerNode(
          <SectionMeta>
            <Paragraph size="$2" color="$red10">
              Couldn&apos;t load · tap to retry
            </Paragraph>
          </SectionMeta>,
        )}
        <CollapsibleBody isCollapsed={isCollapsed}>
          <SectionBody>
            <YStack
              padding="$4"
              borderRadius="$3"
              borderWidth={1}
              borderColor="$red8"
              backgroundColor={withAlpha('#C41E3A', 0.12)}
              gap="$2"
            >
              <Paragraph
                fontFamily={FONT_DISPLAY}
                fontWeight="700"
                fontSize={13}
                letterSpacing={0.4}
                color="$color"
              >
                Unable to load preferences
              </Paragraph>
              <Paragraph size="$3" color="$colorPress">
                We couldn&apos;t reach the notification service. Your other
                settings are saved locally and unaffected.
              </Paragraph>
              <XStack>
                <Button
                  size="$3"
                  backgroundColor="transparent"
                  borderWidth={1}
                  borderColor="$glassBorder"
                  borderRadius="$3"
                  onPress={() => void refetch()}
                  hoverStyle={{ borderColor: '$brandGold' }}
                  pressStyle={{ scale: 0.97 }}
                >
                  <Paragraph
                    fontFamily={FONT_DISPLAY}
                    fontWeight="700"
                    fontSize={11}
                    letterSpacing={1.2}
                    textTransform="uppercase"
                    color="$color"
                  >
                    Retry
                  </Paragraph>
                </Button>
              </XStack>
            </YStack>
          </SectionBody>
        </CollapsibleBody>
      </SectionCard>
    );
  }

  const pushEnabled = prefs?.pushEnabled ?? true;
  const emailEnabled = prefs?.emailEnabled ?? false;
  const matchupStartedEnabled = prefs?.matchupStartedEnabled ?? true;
  const matchupEndedEnabled = prefs?.matchupEndedEnabled ?? true;
  const matchupCloseGameEnabled = prefs?.matchupCloseGameEnabled ?? true;
  const matchupReminderEnabled = prefs?.matchupReminderEnabled ?? true;
  const closeGameThreshold = prefs?.closeGameThreshold ?? CLOSE_GAME_DEFAULT;

  return (
    <SectionCard style={cardStyle}>
      {headerNode(<SectionMeta>Push &amp; email · Matchup alerts</SectionMeta>)}
      <CollapsibleBody isCollapsed={isCollapsed}>
        <SectionBody>
          <SectionEyebrow>Delivery</SectionEyebrow>

          <PrefToggle
            value={pushEnabled}
            onChange={(v) => handleToggle('pushEnabled', v)}
            label="Push notifications"
            description="On this device. Game alerts in your hand."
          />

          <Separator />

          <PrefToggle
            value={emailEnabled}
            onChange={(v) => handleToggle('emailEnabled', v)}
            label="Email notifications"
            description="Sent to your account email."
          />

          <Separator />

          <SectionEyebrow>Matchup alerts</SectionEyebrow>

          <PrefToggle
            value={matchupStartedEnabled}
            onChange={(v) => handleToggle('matchupStartedEnabled', v)}
            label="Matchup started"
            description="First pitch in any matchup you’re a part of."
          />

          <Separator />

          <PrefToggle
            value={matchupEndedEnabled}
            onChange={(v) => handleToggle('matchupEndedEnabled', v)}
            label="Matchup ended"
            description="Final scores when the inning is in the books."
          />

          <Separator />

          <PrefToggle
            value={matchupCloseGameEnabled}
            onChange={(v) => handleToggle('matchupCloseGameEnabled', v)}
            label="Close game alerts"
            description="Ping me when a matchup is within the threshold below."
          />

          {matchupCloseGameEnabled ? (
            <YStack gap="$2" paddingTop="$1">
              <Paragraph size="$3" color="$color" fontWeight="600">
                Close game threshold
              </Paragraph>
              <Paragraph size="$2" color="$colorPress">
                How tight is &ldquo;close&rdquo;? Margin in fantasy points.
              </Paragraph>
              <ThresholdStepper
                value={closeGameThreshold}
                onChange={handleThresholdChange}
                ariaLabel="Close game threshold in points"
              />
            </YStack>
          ) : null}

          <Separator />

          <PrefToggle
            value={matchupReminderEnabled}
            onChange={(v) => handleToggle('matchupReminderEnabled', v)}
            label="Matchup reminders"
            description="Heads-up the night before lineups lock."
          />
        </SectionBody>
      </CollapsibleBody>
    </SectionCard>
  );
}

/* ─── Notifications empty (unauthed) ─── */

function NotificationsSignInCard({
  cardStyle,
}: {
  cardStyle: React.CSSProperties;
}) {
  const navigate = useNavigate();
  return (
    <SectionCard style={cardStyle}>
      {/* Static header — not collapsible. No role/tabIndex so AT users
          don't think there's a control here when there isn't. Also drop
          the pointer affordances inherited from the styled component. */}
      <SectionHeader
        expanded={false}
        cursor="default"
        hoverStyle={{}}
        pressStyle={{}}
      >
        <SectionIconBox>
          <Bell size={18} color="$brandGoldLight" strokeWidth={1.8} />
        </SectionIconBox>
        <YStack flex={1} gap={2}>
          <SectionTitle>Notifications</SectionTitle>
          <SectionMeta>Sign in to manage</SectionMeta>
        </YStack>
      </SectionHeader>
      <SectionBody>
        <YStack
          padding="$5"
          gap="$2"
          alignItems="center"
          borderRadius="$4"
          borderWidth={1}
          borderColor="$glassBorder"
          backgroundColor="$color2"
        >
          <YStack
            width={52}
            height={52}
            borderRadius={26}
            backgroundColor="$accentMuted"
            borderWidth={1}
            borderColor="$glassBorder"
            alignItems="center"
            justifyContent="center"
          >
            <LogIn size={22} color="$brandGoldLight" strokeWidth={1.8} />
          </YStack>
          <Paragraph
            fontFamily={FONT_DISPLAY}
            fontWeight="700"
            fontSize={17}
            color="$color"
            marginTop="$1"
          >
            Sign in to set alerts
          </Paragraph>
          <Paragraph
            size="$3"
            color="$colorPress"
            textAlign="center"
            maxWidth={320}
          >
            Push, email, and matchup alerts live with your account. Appearance
            and stat preferences above are saved on this device.
          </Paragraph>
          <Button
            size="$3"
            backgroundColor="$brandNavy"
            borderWidth={1}
            borderColor="$brandNavyLight"
            borderRadius="$4"
            marginTop="$2"
            onPress={() => navigate('/')}
            hoverStyle={{ backgroundColor: '$brandNavyLight' }}
            pressStyle={{ scale: 0.97 }}
          >
            <Paragraph
              fontFamily={FONT_DISPLAY}
              fontWeight="700"
              fontSize={12}
              letterSpacing={1.4}
              textTransform="uppercase"
              color="white"
            >
              Sign In
            </Paragraph>
          </Button>
        </YStack>
      </SectionBody>
    </SectionCard>
  );
}

/* ─── Main Component ─── */

const PreferencesPage: React.FC = () => {
  const { themePreference, resolvedTheme, setThemePreference } =
    useThemeContext();
  const { isAuthenticated } = useAuth();
  const isDark = resolvedTheme === 'dark';
  const pageBackgroundStyle = useMemo(
    () => getPageBackgroundStyle(isDark),
    [isDark],
  );
  const cardStyle = useMemo(() => getCardStyle(isDark), [isDark]);
  const cardStyleAlt = useMemo(() => getCardStyle(isDark, 80), [isDark]);
  const [prefs, setPrefs] = useState<UserPreferences>(() => ({
    ...loadPrefs(),
    theme: themePreference,
  }));
  const [saved, setSaved] = useState(false);
  const isInitialRender = useRef(true);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<SectionId, boolean>
  >(() => loadCollapsedSections());

  const toggleSection = useCallback((id: SectionId) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      persistCollapsedSections(next);
      return next;
    });
  }, []);

  useEffect(() => {
    setPrefs((prev) => {
      if (prev.theme === themePreference) return prev;
      return { ...prev, theme: themePreference };
    });
  }, [themePreference]);

  const update = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      if (key === 'theme') {
        setThemePreference(value as ThemePreference);
      }
      setPrefs((prev) => ({ ...prev, [key]: value }));
      setSaved(false);
    },
    [setThemePreference],
  );

  // Auto-save on changes (skip the initial render).
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    savePrefs(prefs);
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [prefs]);

  const flashSaved = useCallback(() => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }, []);

  return (
    <PageContainer style={pageBackgroundStyle}>
      <PageMeta
        title="Preferences"
        description="Customize your Legacy Sports experience — choose your theme, display density, and notification settings."
      />
      <ScrollView>
        <ContentContainer>
          {/* ── Page Header ── */}
          <PageHeader>
            <Paragraph
              fontFamily={FONT_DISPLAY}
              fontWeight="700"
              fontSize={11}
              letterSpacing={2.5}
              textTransform="uppercase"
              color="$brandGoldLight"
            >
              Settings
            </Paragraph>
            <Paragraph
              tag="h1"
              fontFamily={FONT_DISPLAY}
              fontWeight="800"
              fontSize={36}
              lineHeight={36}
              letterSpacing={-0.5}
              color={isDark ? '#FFFFFF' : BRAND_NAVY}
              margin={0}
            >
              Preferences
            </Paragraph>
            <Paragraph size="$4" color="$colorPress" marginTop="$1">
              Tune the app to your taste. All changes save automatically — no
              submit button, no fuss.
            </Paragraph>
          </PageHeader>

          {/* ── Saved banner ── */}
          {saved && (
            <SaveBannerWrap aria-live="polite">
              <SaveBanner data-testid="prefs-save-banner">
                <SaveBannerTick>
                  <Check size={14} color="#1A1408" strokeWidth={3} />
                </SaveBannerTick>
                <Paragraph
                  fontFamily={FONT_DISPLAY}
                  fontWeight="700"
                  fontSize={12}
                  letterSpacing={1.4}
                  textTransform="uppercase"
                  color="$color"
                >
                  Saved
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  just now
                </Paragraph>
              </SaveBanner>
            </SaveBannerWrap>
          )}

          {/* ── Appearance ── */}
          <SectionCard style={cardStyle}>
            <SectionHeader
              expanded={!collapsedSections.appearance}
              onPress={() => toggleSection('appearance')}
              onKeyDown={onToggleKeyDown(() => toggleSection('appearance'))}
              {...sectionToggleA11yProps}
              aria-expanded={!collapsedSections.appearance}
            >
              <SectionIconBox>
                <SunMoon size={18} color="$brandGoldLight" strokeWidth={1.8} />
              </SectionIconBox>
              <YStack flex={1} gap={2}>
                <SectionTitle>Appearance</SectionTitle>
                <SectionMeta>Theme · Animations</SectionMeta>
              </YStack>
              <CollapseChevron isCollapsed={collapsedSections.appearance} />
            </SectionHeader>

            <CollapsibleBody isCollapsed={collapsedSections.appearance}>
              <SectionBody>
                <PrefRow>
                  <PrefLabel>
                    <Paragraph size="$4" color="$color" fontWeight="600">
                      Theme
                    </Paragraph>
                    <Paragraph size="$3" color="$colorPress">
                      Match your phone or pick your own. Dark is the default —
                      easier on the eyes during a Sunday slate.
                    </Paragraph>
                  </PrefLabel>
                </PrefRow>
                <ThemePicker
                  value={prefs.theme}
                  onChange={(v) => update('theme', v)}
                />

                <Separator />

                <PrefToggle
                  value={prefs.enableAnimations}
                  onChange={(v) => update('enableAnimations', v)}
                  label="Animations"
                  description="Page transitions and micro-motion. Disable for reduced motion."
                />
              </SectionBody>
            </CollapsibleBody>
          </SectionCard>

          {/* ── Sports & Stats ── */}
          <SectionCard style={cardStyleAlt}>
            <SectionHeader
              expanded={!collapsedSections.sports}
              onPress={() => toggleSection('sports')}
              onKeyDown={onToggleKeyDown(() => toggleSection('sports'))}
              {...sectionToggleA11yProps}
              aria-expanded={!collapsedSections.sports}
            >
              <SectionIconBox>
                <Trophy size={18} color="$brandGoldLight" strokeWidth={1.8} />
              </SectionIconBox>
              <YStack flex={1} gap={2}>
                <SectionTitle>Sports &amp; Stats</SectionTitle>
                <SectionMeta>Default sport · Format · Totals</SectionMeta>
              </YStack>
              <CollapseChevron isCollapsed={collapsedSections.sports} />
            </SectionHeader>

            <CollapsibleBody isCollapsed={collapsedSections.sports}>
              <SectionBody>
                <PrefRow>
                  <PrefLabel>
                    <Paragraph size="$4" color="$color" fontWeight="600">
                      Default sport
                    </Paragraph>
                    <Paragraph size="$3" color="$colorPress">
                      Where the app lands when you open it.
                    </Paragraph>
                  </PrefLabel>
                  <Segmented<DefaultSportView>
                    value={prefs.defaultSport}
                    options={[
                      { value: 'baseball', label: 'Baseball' },
                      { value: 'football', label: 'Football' },
                    ]}
                    onChange={(v) => update('defaultSport', v)}
                    ariaLabel="Default sport"
                  />
                </PrefRow>

                <Separator />

                <PrefRow>
                  <PrefLabel>
                    <Paragraph size="$4" color="$color" fontWeight="600">
                      Stats format
                    </Paragraph>
                    <Paragraph size="$3" color="$colorPress">
                      Standard shows the headlines. Expanded adds advanced
                      metrics like wRC+, BABIP, and split splits.
                    </Paragraph>
                  </PrefLabel>
                  <Segmented<StatsFormat>
                    value={prefs.statsFormat}
                    options={[
                      { value: 'standard', label: 'Standard' },
                      { value: 'expanded', label: 'Expanded' },
                    ]}
                    onChange={(v) => update('statsFormat', v)}
                    ariaLabel="Stats format"
                  />
                </PrefRow>

                <Separator />

                <PrefToggle
                  value={prefs.showSeasonTotals}
                  onChange={(v) => update('showSeasonTotals', v)}
                  label="Show season totals"
                  description="Append running season numbers next to the weekly box score."
                />
              </SectionBody>
            </CollapsibleBody>
          </SectionCard>

          {/* ── Notifications ── */}
          {isAuthenticated ? (
            <NotificationPreferencesSection
              cardStyle={cardStyle}
              isDark={isDark}
              isCollapsed={collapsedSections.notifications}
              onToggleCollapse={() => toggleSection('notifications')}
              onSaved={flashSaved}
            />
          ) : (
            <NotificationsSignInCard cardStyle={cardStyle} />
          )}
        </ContentContainer>
      </ScrollView>
    </PageContainer>
  );
};

export default PreferencesPage;
