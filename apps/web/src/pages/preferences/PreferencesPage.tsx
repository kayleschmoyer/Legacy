import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  H1,
  Paragraph,
  Separator,
  useAuth,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
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

/* ─── Storage key ─── */

const PREFS_STORAGE_KEY = 'ls_user_preferences';

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
  localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
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
  gap: '$6',
  $sm: {
    paddingHorizontal: '$3',
    gap: '$4',
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
  borderBottomWidth: 1,
  borderBottomColor: '$glassBorder',
});

const SectionIconBox = styled(YStack, {
  width: 36,
  height: 36,
  borderRadius: '$4',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$color2',
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
      true: { backgroundColor: '$blue9' },
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

const OptionGroup = styled(XStack, {
  gap: '$2',
  flexWrap: 'wrap',
});

const OptionChip = styled(YStack, {
  paddingHorizontal: '$3',
  paddingVertical: '$2',
  borderRadius: '$4',
  borderWidth: 1,
  cursor: 'pointer',
  animation: 'quick',
  variants: {
    selected: {
      true: {
        backgroundColor: '$accentMuted',
        borderColor: '$brandNavyLight',
      },
      false: {
        backgroundColor: '$color2',
        borderColor: '$borderColor',
      },
    },
  } as const,
  defaultVariants: { selected: false },
  hoverStyle: { opacity: 0.85 },
  pressStyle: { scale: 0.97, opacity: 0.9 },
});

const SaveBanner = styled(XStack, {
  alignItems: 'center',
  gap: '$3',
  padding: '$3',
  borderRadius: '$5',
  borderWidth: 1,
  borderColor: '$successMuted',
  backgroundColor: '$successMuted',
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

function getCardStyle(isDark: boolean, navyAlpha = 0.25): React.CSSProperties {
  return isDark
    ? {
        background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.85)} 0%, ${withAlpha(BRAND_NAVY, navyAlpha)} 100%)`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }
    : {
        background: `linear-gradient(135deg, ${withAlpha('#FFFFFF', 0.9)} 0%, ${withAlpha(BRAND_NAVY, 0.04)} 100%)`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      };
}

/* ─── Sub-components ─── */

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
        <Paragraph size="$4" color="$color" fontWeight="500">
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

interface ChipGroupProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}

function ChipGroup<T extends string>({
  value,
  options,
  onChange,
}: ChipGroupProps<T>) {
  return (
    <OptionGroup>
      {options.map((opt) => (
        <OptionChip
          key={opt.value}
          selected={value === opt.value}
          onPress={() => onChange(opt.value)}
          role="radio"
          aria-checked={value === opt.value}
        >
          <Paragraph
            size="$3"
            fontWeight="500"
            color={value === opt.value ? '$brandGoldLight' : '$color'}
          >
            {opt.label}
          </Paragraph>
        </OptionChip>
      ))}
    </OptionGroup>
  );
}

/* ─── Main Component ─── */

/* ─── Notification Preferences Sub-component ─── */

function NotificationPreferencesSection({
  cardStyle,
  isDark,
}: {
  cardStyle: React.CSSProperties;
  isDark: boolean;
}) {
  const { data, loading, error } = useGetUserNotificationPreferencesQuery();
  const [updatePrefs] = useUpdateNotificationPreferencesMutation();

  const prefs = data?.getUserNotificationPreferences;

  type NotificationToggleField =
    | 'matchupStartedEnabled'
    | 'matchupEndedEnabled'
    | 'matchupCloseGameEnabled'
    | 'matchupReminderEnabled'
    | 'pushEnabled'
    | 'emailEnabled';

  const handleToggle = useCallback(
    (field: NotificationToggleField, value: boolean) => {
      const optimisticResult = {
        __typename: 'NotificationPreference' as const,
        id: prefs?.id ?? 0,
        userId: prefs?.userId ?? 0,
        matchupStartedEnabled: prefs?.matchupStartedEnabled ?? true,
        matchupEndedEnabled: prefs?.matchupEndedEnabled ?? true,
        matchupCloseGameEnabled: prefs?.matchupCloseGameEnabled ?? true,
        matchupReminderEnabled: prefs?.matchupReminderEnabled ?? true,
        pushEnabled: prefs?.pushEnabled ?? true,
        emailEnabled: prefs?.emailEnabled ?? false,
        closeGameThreshold: prefs?.closeGameThreshold ?? 50,
        createdAt: prefs?.createdAt ?? '',
        updatedAt: new Date().toISOString(),
        [field]: value,
      };

      void updatePrefs({
        variables: { input: { [field]: value } },
        optimisticResponse: {
          __typename: 'Mutation',
          updateNotificationPreferences: optimisticResult,
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
    },
    [updatePrefs, prefs],
  );

  if (loading) {
    return (
      <SectionCard style={cardStyle}>
        <SectionHeader>
          <SectionIconBox>
            <Paragraph fontSize={16} lineHeight={18}>
              <span role="img" aria-label="notifications">
                🔔
              </span>
            </Paragraph>
          </SectionIconBox>
          <YStack flex={1}>
            <Paragraph size="$4" color="$color" fontWeight="600">
              Notifications
            </Paragraph>
            <Paragraph size="$2" color="$colorPress">
              Push and email notification settings
            </Paragraph>
          </YStack>
        </SectionHeader>
        <SectionBody>
          <XStack justifyContent="center" padding="$4">
            <Spinner
              size="small"
              color={isDark ? BRAND_GOLD_LIGHT : BRAND_NAVY}
            />
          </XStack>
        </SectionBody>
      </SectionCard>
    );
  }

  if (error && !loading) {
    return (
      <SectionCard style={cardStyle}>
        <SectionHeader>
          <SectionIconBox>
            <Paragraph fontSize={16} lineHeight={18}>
              <span role="img" aria-label="notifications">
                🔔
              </span>
            </Paragraph>
          </SectionIconBox>
          <YStack flex={1}>
            <Paragraph size="$4" color="$color" fontWeight="600">
              Notifications
            </Paragraph>
            <Paragraph size="$2" color="$colorPress">
              Push and email notification settings
            </Paragraph>
          </YStack>
        </SectionHeader>
        <SectionBody>
          <Paragraph size="$4" fontWeight="600" color="$color">
            Unable to load notification preferences
          </Paragraph>
          <Paragraph size="$3" color="$colorPress">
            There was a problem fetching your notification settings. Please try
            again later.
          </Paragraph>
        </SectionBody>
      </SectionCard>
    );
  }

  const pushEnabled = prefs?.pushEnabled ?? true;
  const emailEnabled = prefs?.emailEnabled ?? false;
  const matchupStartedEnabled = prefs?.matchupStartedEnabled ?? true;
  const matchupEndedEnabled = prefs?.matchupEndedEnabled ?? true;
  const matchupCloseGameEnabled = prefs?.matchupCloseGameEnabled ?? true;
  const matchupReminderEnabled = prefs?.matchupReminderEnabled ?? true;

  return (
    <SectionCard style={cardStyle}>
      <SectionHeader>
        <SectionIconBox>
          <Paragraph fontSize={16} lineHeight={18}>
            <span role="img" aria-label="notifications">
              🔔
            </span>
          </Paragraph>
        </SectionIconBox>
        <YStack flex={1}>
          <Paragraph size="$4" color="$color" fontWeight="600">
            Notifications
          </Paragraph>
          <Paragraph size="$2" color="$colorPress">
            Push and email notification settings
          </Paragraph>
        </YStack>
      </SectionHeader>

      <SectionBody>
        <Paragraph size="$3" color="$colorPress" fontWeight="600">
          Delivery channels
        </Paragraph>

        <PrefToggle
          value={pushEnabled}
          onChange={(v) => handleToggle('pushEnabled', v)}
          label="Push notifications"
          description="Receive push notifications on your devices"
        />

        <Separator />

        <PrefToggle
          value={emailEnabled}
          onChange={(v) => handleToggle('emailEnabled', v)}
          label="Email notifications"
          description="Receive notifications via email"
        />

        <Separator />

        <Paragraph
          size="$3"
          color="$colorPress"
          fontWeight="600"
          paddingTop="$2"
        >
          Matchup alerts
        </Paragraph>

        <PrefToggle
          value={matchupStartedEnabled}
          onChange={(v) => handleToggle('matchupStartedEnabled', v)}
          label="Matchup started"
          description="Get notified when a new matchup period begins"
        />

        <Separator />

        <PrefToggle
          value={matchupEndedEnabled}
          onChange={(v) => handleToggle('matchupEndedEnabled', v)}
          label="Matchup ended"
          description="Get notified when a matchup period ends with final results"
        />

        <Separator />

        <PrefToggle
          value={matchupCloseGameEnabled}
          onChange={(v) => handleToggle('matchupCloseGameEnabled', v)}
          label="Close game alerts"
          description="Get notified when your matchup is within the close-game threshold"
        />

        <Separator />

        <PrefToggle
          value={matchupReminderEnabled}
          onChange={(v) => handleToggle('matchupReminderEnabled', v)}
          label="Matchup reminders"
          description="Receive reminders about upcoming matchup deadlines"
        />
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
  const cardStyleAlt = useMemo(() => getCardStyle(isDark, 0.2), [isDark]);
  const [prefs, setPrefs] = useState<UserPreferences>(() => ({
    ...loadPrefs(),
    // theme is owned by ThemeContext; sync local mirror from context
    theme: themePreference,
  }));
  const [saved, setSaved] = useState(false);
  const isInitialRender = useRef(true);

  // Keep local mirror in sync when context changes (e.g. system preference)
  useEffect(() => {
    setPrefs((prev) => {
      if (prev.theme === themePreference) return prev;
      return { ...prev, theme: themePreference };
    });
  }, [themePreference]);

  const update = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      if (key === 'theme') {
        // Route theme changes through ThemeContext so they apply immediately
        setThemePreference(value as ThemePreference);
      }
      setPrefs((prev) => ({ ...prev, [key]: value }));
      setSaved(false);
    },
    [setThemePreference],
  );

  // Auto-save on changes (skip the initial render)
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
            <H1
              style={{
                fontSize: 32,
                fontWeight: '700',
                color: isDark ? BRAND_GOLD_LIGHT : BRAND_NAVY,
                letterSpacing: -0.5,
              }}
            >
              Preferences
            </H1>
            <Paragraph size="$4" color="$colorPress">
              Customize your Legacy Sports experience. Changes are saved
              automatically.
            </Paragraph>
          </PageHeader>

          {/* ── Saved indicator ── */}
          {saved && (
            <SaveBanner>
              <Paragraph fontSize={14} lineHeight={16}>
                <span role="img" aria-label="check">
                  ✅
                </span>
              </Paragraph>
              <Paragraph size="$3" color="$colorPress">
                Preferences saved
              </Paragraph>
            </SaveBanner>
          )}

          {/* ── Appearance ── */}
          <SectionCard style={cardStyle}>
            <SectionHeader>
              <SectionIconBox>
                <Paragraph fontSize={16} lineHeight={18}>
                  <span role="img" aria-label="appearance">
                    🎨
                  </span>
                </Paragraph>
              </SectionIconBox>
              <YStack flex={1}>
                <Paragraph size="$4" color="$color" fontWeight="600">
                  Appearance
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  Display theme and visual settings
                </Paragraph>
              </YStack>
            </SectionHeader>

            <SectionBody>
              <PrefRow>
                <PrefLabel>
                  <Paragraph size="$4" color="$color" fontWeight="500">
                    Theme
                  </Paragraph>
                  <Paragraph size="$3" color="$colorPress">
                    Choose your preferred color scheme. Changes apply
                    immediately.
                  </Paragraph>
                </PrefLabel>
                <ChipGroup<ThemePreference>
                  value={prefs.theme}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                  onChange={(v) => update('theme', v)}
                />
              </PrefRow>

              <Separator />

              <PrefToggle
                value={prefs.enableAnimations}
                onChange={(v) => update('enableAnimations', v)}
                label="Enable animations"
                description="Show transition animations throughout the app"
              />
            </SectionBody>
          </SectionCard>

          {/* ── Sports & Stats ── */}
          <SectionCard style={cardStyleAlt}>
            <SectionHeader>
              <SectionIconBox>
                <Paragraph fontSize={16} lineHeight={18}>
                  <span role="img" aria-label="sports">
                    ⚾
                  </span>
                </Paragraph>
              </SectionIconBox>
              <YStack flex={1}>
                <Paragraph size="$4" color="$color" fontWeight="600">
                  Sports &amp; Stats
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  Default view and statistics display preferences
                </Paragraph>
              </YStack>
            </SectionHeader>

            <SectionBody>
              <PrefRow>
                <PrefLabel>
                  <Paragraph size="$4" color="$color" fontWeight="500">
                    Default sport
                  </Paragraph>
                  <Paragraph size="$3" color="$colorPress">
                    Your preferred sport shown on the home screen
                  </Paragraph>
                </PrefLabel>
                <ChipGroup<DefaultSportView>
                  value={prefs.defaultSport}
                  options={[
                    { value: 'baseball', label: 'Baseball' },
                    { value: 'football', label: 'Football' },
                  ]}
                  onChange={(v) => update('defaultSport', v)}
                />
              </PrefRow>

              <Separator />

              <PrefRow>
                <PrefLabel>
                  <Paragraph size="$4" color="$color" fontWeight="500">
                    Stats format
                  </Paragraph>
                  <Paragraph size="$3" color="$colorPress">
                    How statistics are presented in player and team views
                  </Paragraph>
                </PrefLabel>
                <ChipGroup<StatsFormat>
                  value={prefs.statsFormat}
                  options={[
                    { value: 'standard', label: 'Standard' },
                    { value: 'expanded', label: 'Expanded' },
                  ]}
                  onChange={(v) => update('statsFormat', v)}
                />
              </PrefRow>

              <Separator />

              <PrefToggle
                value={prefs.showSeasonTotals}
                onChange={(v) => update('showSeasonTotals', v)}
                label="Show season totals"
                description="Display cumulative season stats alongside per-game stats"
              />
            </SectionBody>
          </SectionCard>

          {/* ── Notifications ── */}
          {isAuthenticated && (
            <NotificationPreferencesSection
              cardStyle={cardStyle}
              isDark={isDark}
            />
          )}
        </ContentContainer>
      </ScrollView>
    </PageContainer>
  );
};

export default PreferencesPage;
