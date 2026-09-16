import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOGGER } from '@legacy-sports/logging';
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform, ScrollView } from 'react-native';
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
import { brand } from '@legacy-sports/design-tokens';
import {
  useGetUserPreferencesQuery,
  useUpdateUserPreferencesMutation,
} from '@legacy-sports/graphql';
import { useThemeContext } from '../../context/ThemeContext';
import { AUTHORIZED_CONTEXT } from '../../common/auth/AuthorizedUserContext';
import { useDeviceLoggingPreference } from '../../features/device-logs/useDeviceLoggingPreference';
import { shareCurrentLogFile } from '../../features/device-logs/deviceLogs';

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
  audioEnabled: boolean;
}

const DEFAULT_PREFS: UserPreferences = {
  theme: 'system',
  defaultSport: 'baseball',
  statsFormat: 'standard',
  showSeasonTotals: true,
  enableAnimations: true,
  // Audio is strictly opt-in — never on by default (LS-10111).
  audioEnabled: false,
};

/* ─── Storage helpers (AsyncStorage on native / sessionStorage on web) ─── */

function loadWebPrefs(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(STORAGE_KEY);
}

function saveWebPrefs(prefs: UserPreferences): void {
  if (typeof sessionStorage === 'undefined') {
    LOGGER.warn('sessionStorage not available on web platform');
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

async function loadPrefsAsync(): Promise<UserPreferences> {
  try {
    const raw =
      Platform.OS === 'web'
        ? loadWebPrefs()
        : await AsyncStorage.getItem(STORAGE_KEY);
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
  if (Platform.OS === 'web') {
    try {
      saveWebPrefs(prefs);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      LOGGER.error('Failed to save user preferences', err);
    }
    return;
  }

  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)).catch((error) => {
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
        backgroundColor={value ? brand.navyLight : '$color5'}
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
          borderColor={value === opt.value ? brand.navyLight : '$borderColor'}
          backgroundColor={
            value === opt.value ? `${brand.navyLight}40` : '$color2'
          }
          onPress={() => onChange(opt.value)}
          pressStyle={{ opacity: 0.8 }}
        >
          <Paragraph
            size="$3"
            fontWeight="500"
            color={value === opt.value ? brand.goldLight : '$color'}
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

  // The audio opt-in is persisted server-side so it syncs across devices
  // (LS-10111), the same basis as web's stats-format sync (LS-7138). Every
  // other preference on this screen remains device-local.
  const isAuthenticated = currentUser != null;
  const { data: serverPrefsData } = useGetUserPreferencesQuery({
    skip: !isAuthenticated,
    fetchPolicy: 'cache-and-network',
  });
  const [updateUserPreferences] = useUpdateUserPreferencesMutation();
  // The server is authoritative for the audio opt-in. Held in a ref so the
  // on-device load below can't clobber it: that load is async, so it can
  // resolve *after* the query has already hydrated the account's value.
  const serverAudioRef = useRef<boolean | null>(null);

  // Load persisted preferences on mount
  useEffect(() => {
    void loadPrefsAsync().then((loaded) => {
      setPrefs((prev) => ({
        ...loaded,
        theme: prev.theme,
        audioEnabled: serverAudioRef.current ?? loaded.audioEnabled,
      }));
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

  // Reflect the server-side audio opt-in once it loads, so a value set on
  // another device wins over stale on-device storage (LS-10111).
  useEffect(() => {
    const serverAudio = serverPrefsData?.getUserPreferences?.audioEnabled;
    if (typeof serverAudio === 'boolean') {
      serverAudioRef.current = serverAudio;
      setPrefs((prev) => {
        if (prev.audioEnabled === serverAudio) return prev;
        return { ...prev, audioEnabled: serverAudio };
      });
    }
  }, [serverPrefsData]);

  const update = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      if (key === 'theme') {
        // Route theme changes through ThemeContext so they apply immediately
        setThemePreference(value as ThemePreference);
      }
      // Audio opt-in is persisted server-side so the gate travels with the
      // account rather than the device (LS-10111).
      if (key === 'audioEnabled' && isAuthenticated) {
        void updateUserPreferences({
          variables: { input: { audioEnabled: value as boolean } },
        });
      }
      setPrefs((prev) => ({ ...prev, [key]: value }));
      setSaved(false);
    },
    [setThemePreference, isAuthenticated, updateUserPreferences],
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
              color: brand.goldLight,
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
            borderColor={`${brand.navyLight}66`}
            backgroundColor={`${brand.navyLight}26`}
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

          <Separator />

          <PrefToggle
            value={prefs.audioEnabled}
            onChange={(v) => update('audioEnabled', v)}
            label="Sound effects"
            description="Play short sounds for big moments, like a touchdown. Off by default."
            testID="audio-enabled-toggle"
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
