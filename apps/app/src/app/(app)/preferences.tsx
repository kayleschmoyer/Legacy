import { LOGGER } from '@legacy-sports/logging';
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ScrollView } from 'react-native';
import { secureStorage } from '@legacy-sports/shared-components';
import {
  Button,
  H1,
  Paragraph,
  Separator,
  Switch,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { useThemeContext } from '../../context/ThemeContext';
import { AUTHORIZED_CONTEXT } from '../../common/auth/AuthorizedUserContext';
import { useDeviceLoggingPreference } from '../../features/device-logs/useDeviceLoggingPreference';
import { shareCurrentLogFile } from '../../features/device-logs/deviceLogs';

const BRAND_GOLD_LIGHT = '#C5A55A';
const BRAND_NAVY_LIGHT = '#2C4A7C';
const STORAGE_KEY = 'ls_user_preferences';

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

/* ─── Storage helpers (Expo SecureStore on native / sessionStorage on web) ─── */

async function loadPrefsAsync(): Promise<UserPreferences> {
  try {
    // hasItem() triggers lazy initialization of SecureStore on native
    await secureStorage.hasItem(STORAGE_KEY);
    const raw = await secureStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return {
      ...DEFAULT_PREFS,
      ...(JSON.parse(raw) as Partial<UserPreferences>),
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    LOGGER.error('Failed to load user preferences', err);
    return DEFAULT_PREFS;
  }
}

function savePrefsAsync(prefs: UserPreferences): void {
  secureStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)).catch((error) => {
    const err = error instanceof Error ? error : new Error(String(error));
    LOGGER.error('Failed to save user preferences', err);
  });
}

/* ─── Toggle component ─── */

interface PrefToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  testID?: string;
}

function PrefToggle({
  value,
  onChange,
  label,
  description,
  testID,
}: PrefToggleProps) {
  return (
    <XStack alignItems="center" justifyContent="space-between" gap="$4">
      <YStack gap="$1" flex={1}>
        <Paragraph size="$4" color="$color" fontWeight="500">
          {label}
        </Paragraph>
        {description ? (
          <Paragraph size="$3" color="$colorPress">
            {description}
          </Paragraph>
        ) : null}
      </YStack>
      <Switch
        size="$4"
        checked={value}
        onCheckedChange={onChange}
        backgroundColor={value ? BRAND_NAVY_LIGHT : '$color5'}
        testID={testID}
      >
        <Switch.Thumb animation="quick" />
      </Switch>
    </XStack>
  );
}

/* ─── Chip group component ─── */

interface ChipOption<T> {
  value: T;
  label: string;
}

interface ChipGroupProps<T extends string> {
  value: T;
  options: ChipOption<T>[];
  onChange: (v: T) => void;
}

function ChipGroup<T extends string>({
  value,
  options,
  onChange,
}: ChipGroupProps<T>) {
  return (
    <XStack gap="$2" flexWrap="wrap">
      {options.map((opt) => (
        <YStack
          key={opt.value}
          paddingHorizontal="$3"
          paddingVertical="$2"
          borderRadius="$4"
          borderWidth={1}
          borderColor={value === opt.value ? BRAND_NAVY_LIGHT : '$borderColor'}
          backgroundColor={
            value === opt.value ? `${BRAND_NAVY_LIGHT}40` : '$color2'
          }
          onPress={() => onChange(opt.value)}
          pressStyle={{ opacity: 0.8 }}
        >
          <Paragraph
            size="$3"
            fontWeight="500"
            color={value === opt.value ? BRAND_GOLD_LIGHT : '$color'}
          >
            {opt.label}
          </Paragraph>
        </YStack>
      ))}
    </XStack>
  );
}

/* ─── Section wrapper ─── */

interface SectionProps {
  icon: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

function SectionCard({ icon, title, subtitle, children }: SectionProps) {
  return (
    <YStack
      borderRadius="$6"
      borderWidth={1}
      borderColor="$borderColor"
      overflow="hidden"
    >
      <XStack
        paddingHorizontal="$5"
        paddingVertical="$4"
        alignItems="center"
        gap="$3"
        borderBottomWidth={1}
        borderBottomColor="$borderColor"
      >
        <YStack
          width={36}
          height={36}
          borderRadius="$4"
          alignItems="center"
          justifyContent="center"
          backgroundColor="$color2"
        >
          <Text fontSize={16}>{icon}</Text>
        </YStack>
        <YStack flex={1}>
          <Paragraph size="$4" color="$color" fontWeight="600">
            {title}
          </Paragraph>
          <Paragraph size="$2" color="$colorPress">
            {subtitle}
          </Paragraph>
        </YStack>
      </XStack>
      <YStack padding="$5" gap="$5">
        {children}
      </YStack>
    </YStack>
  );
}

/* ─── Main Component ─── */

function AdminToolsSection(): React.JSX.Element {
  const { enabled, setEnabled } = useDeviceLoggingPreference(true);
  const [shareError, setShareError] = useState<string | null>(null);

  const onShare = useCallback(() => {
    setShareError(null);
    shareCurrentLogFile().catch((error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      LOGGER.error('Failed to share device log file', err);
      setShareError(err.message);
    });
  }, []);

  return (
    <SectionCard
      icon="🛠️"
      title="Admin Tools"
      subtitle="Diagnostic tooling — only visible to admins"
    >
      <PrefToggle
        value={enabled}
        onChange={(v) => {
          void setEnabled(v);
        }}
        label="Write logs to device"
        description="Persist log entries to a daily file on this device. Keeps the last 7 days."
        testID="device-logs-toggle"
      />

      <Separator />

      <YStack gap="$2">
        <Button
          size="$3"
          disabled={!enabled}
          opacity={enabled ? 1 : 0.5}
          onPress={onShare}
          testID="device-logs-share-button"
        >
          Share log file
        </Button>
        {shareError ? (
          <Paragraph size="$2" color="$red10">
            {shareError}
          </Paragraph>
        ) : null}
      </YStack>
    </SectionCard>
  );
}

export default function PreferencesScreen(): React.JSX.Element {
  const { themePreference, setThemePreference } = useThemeContext();
  const currentUser = useContext(AUTHORIZED_CONTEXT);
  const [prefs, setPrefs] = useState<UserPreferences>({
    ...DEFAULT_PREFS,
    theme: themePreference,
  });
  const [saved, setSaved] = useState(false);
  const initialLoadDone = useRef(false);

  // Load persisted preferences on mount
  useEffect(() => {
    void loadPrefsAsync().then((loaded) => {
      setPrefs((prev) => ({ ...loaded, theme: prev.theme }));
      // Delay flag so the save effect skips the initial render cycle
      requestAnimationFrame(() => {
        initialLoadDone.current = true;
      });
    });
  }, []);

  // Keep local mirror in sync when context changes (e.g. system preference flip)
  useEffect(() => {
    setPrefs((prev) => ({ ...prev, theme: themePreference }));
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

  useEffect(() => {
    if (!initialLoadDone.current) return;
    savePrefsAsync(prefs);
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [prefs]);

  return (
    <ScrollView>
      <YStack
        padding="$5"
        gap="$6"
        backgroundColor="$background"
        minHeight="100%"
      >
        {/* Page Header */}
        <YStack gap="$2" paddingVertical="$4">
          <H1
            style={{
              fontSize: 32,
              fontWeight: '700',
              color: BRAND_GOLD_LIGHT,
            }}
          >
            Preferences
          </H1>
          <Paragraph size="$4" color="$colorPress">
            Customize your Legacy Sports experience. Changes are saved
            automatically.
          </Paragraph>
        </YStack>

        {/* Saved indicator */}
        {saved && (
          <XStack
            alignItems="center"
            gap="$3"
            padding="$3"
            borderRadius="$5"
            borderWidth={1}
            borderColor={`${BRAND_NAVY_LIGHT}66`}
            backgroundColor={`${BRAND_NAVY_LIGHT}26`}
          >
            <Text fontSize={14}>✅</Text>
            <Paragraph size="$3" color="$colorPress">
              Preferences saved
            </Paragraph>
          </XStack>
        )}

        {/* Appearance */}
        <SectionCard
          icon="🎨"
          title="Appearance"
          subtitle="Display theme and visual settings"
        >
          <XStack
            alignItems="flex-start"
            justifyContent="space-between"
            gap="$4"
          >
            <YStack gap="$1" flex={1}>
              <Paragraph size="$4" color="$color" fontWeight="500">
                Theme
              </Paragraph>
              <Paragraph size="$3" color="$colorPress">
                Choose your preferred color scheme
              </Paragraph>
            </YStack>
            <ChipGroup<ThemePreference>
              value={prefs.theme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              onChange={(v) => update('theme', v)}
            />
          </XStack>

          <Separator />

          <PrefToggle
            value={prefs.enableAnimations}
            onChange={(v) => update('enableAnimations', v)}
            label="Enable animations"
            description="Show transition animations throughout the app"
          />
        </SectionCard>

        {/* Sports & Stats */}
        <SectionCard
          icon="⚾"
          title="Sports & Stats"
          subtitle="Default view and statistics display preferences"
        >
          <XStack
            alignItems="flex-start"
            justifyContent="space-between"
            gap="$4"
          >
            <YStack gap="$1" flex={1}>
              <Paragraph size="$4" color="$color" fontWeight="500">
                Default sport
              </Paragraph>
              <Paragraph size="$3" color="$colorPress">
                Your preferred sport shown on the home screen
              </Paragraph>
            </YStack>
            <ChipGroup<DefaultSportView>
              value={prefs.defaultSport}
              options={[
                { value: 'baseball', label: 'Baseball' },
                { value: 'football', label: 'Football' },
              ]}
              onChange={(v) => update('defaultSport', v)}
            />
          </XStack>

          <Separator />

          <XStack
            alignItems="flex-start"
            justifyContent="space-between"
            gap="$4"
          >
            <YStack gap="$1" flex={1}>
              <Paragraph size="$4" color="$color" fontWeight="500">
                Stats format
              </Paragraph>
              <Paragraph size="$3" color="$colorPress">
                How statistics are presented in player and team views
              </Paragraph>
            </YStack>
            <ChipGroup<StatsFormat>
              value={prefs.statsFormat}
              options={[
                { value: 'standard', label: 'Standard' },
                { value: 'expanded', label: 'Expanded' },
              ]}
              onChange={(v) => update('statsFormat', v)}
            />
          </XStack>

          <Separator />

          <PrefToggle
            value={prefs.showSeasonTotals}
            onChange={(v) => update('showSeasonTotals', v)}
            label="Show season totals"
            description="Display cumulative season stats alongside per-game stats"
          />
        </SectionCard>

        {currentUser?.isAdmin ? <AdminToolsSection /> : null}
      </YStack>
    </ScrollView>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
