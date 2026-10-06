import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@legacy-sports/design-tokens';
import { useThemeContext } from '../../../../context/ThemeContext';

/**
 * Each tab owns its own Stack so drill-down screens (league detail, team,
 * player, settings sub-pages, …) are pushed *inside* the tab and the tab bar
 * stays visible (LS-10614). This one file is expo-router's shared-route layout:
 * the `(home,leagues,players,games,you)` array group expands into five copies,
 * one per tab, and every drill-down route in this directory exists in all five
 * stacks. Group segments never appear in the URL, so `/football/league/42` is
 * unchanged, and expo-router resolves a push into the currently focused tab's
 * group — opening a league from Home stays in Home's stack.
 *
 * Modal/immersive flows (drafts, create/join, games in play) live outside
 * `(tabs)` on the root Stack in `(app)/_layout.tsx`, which hides the tab bar.
 * See docs/architecture/mobile-navigation.md.
 */
export const unstable_settings = {
  home: { initialRouteName: 'home' },
  leagues: { initialRouteName: 'leagues' },
  players: { initialRouteName: 'players' },
  games: { initialRouteName: 'games' },
  you: { initialRouteName: 'you' },
};

/** The root screen of each tab's stack — the screen the tab bar opens. */
const TAB_ROOTS = new Set(Object.keys(unstable_settings));

export default function TabStackLayout() {
  const { resolvedTheme } = useThemeContext();
  const insets = useSafeAreaInsets();
  const palette = colors[resolvedTheme];

  return (
    <Stack
      screenOptions={({ route }) => ({
        // Headerless like the rest of the app (LS-8766). Tab roots read
        // `useSafeAreaInsets` themselves; pushed screens relied on the root
        // Stack's scene padding before they moved here, so they get it from
        // this Stack instead.
        headerShown: false,
        contentStyle: TAB_ROOTS.has(route.name)
          ? { backgroundColor: palette.surface.bg }
          : { backgroundColor: palette.surface.bg, paddingTop: insets.top },
      })}
    />
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';
