/**
 * LS-9766 regression test.
 *
 * The Leagues tab's "create league" button navigates straight to
 * `/league/create` with no wrapping `Redirect`, so this route is the first
 * place in a session that `@legacy-sports/shared-components/leagues` (the
 * barrel `create.tsx` imports `LeagueCreateWizard` from) gets evaluated on
 * native. The crash reported in LS-9766 happened at *module-load* time, not
 * render time: `DateTimePicker`, `CreateLeagueModal`, and `TradingCenter` each
 * imported `Platform` from the shared `platform-components` native barrel
 * purely to read `Platform.OS` — that barrel transitively evaluates the
 * mobile OAuth provider (`@react-native-google-signin/google-signin`), which
 * calls `TurboModuleRegistry.getEnforcing('RNGoogleSignin')` at import time.
 * None of those three files have any OAuth dependency of their own; because
 * `entry/leagues.ts` re-exports all of them from one barrel, importing
 * anything from it — including the wizard the Leagues tab actually needs —
 * pulled in that whole native-module lookup as a side effect.
 *
 * `apps/app`'s RN jest preset (unlike `lib/shared-components`'s jsdom preset,
 * which never touches `TurboModuleRegistry`) is what actually exercises this,
 * so it is the only suite that would have caught it.
 *
 * The barrel is imported statically at the top of this file, not via a
 * runtime `require()` inside the test body — a `require()`/`import()` call
 * here reads to Nx's project graph as a *dynamic* dependency edge to
 * `shared-components`, which flips `@nx/enforce-module-boundaries` into
 * treating that package as lazy-loaded and flags every ordinary static
 * import of it repo-wide. A plain static import exercises the exact same
 * module-eval-time crash (Jest evaluates it before any test in this file
 * runs) without that side effect.
 */
import * as LeaguesBarrel from '@legacy-sports/shared-components/leagues';

describe('shared-components leagues barrel import (LS-9766)', () => {
  it('imports without evaluating unrelated native-module lookups', () => {
    expect(LeaguesBarrel).toBeDefined();
  });
});
