/**
 * ADR-0016 reference migration on NATIVE — DraftPage + PlayerSearchBox (AC2),
 * emulator-gated.
 *
 * Proves the ADR-0016 thesis directly: the SAME migrated page objects the web
 * dual-mode specs use — {@link ../../pages/draft.page.DraftPage} composing
 * {@link ../../components/player-search-box.component.PlayerSearchBox} — drive
 * the native app through {@link ../appium-native.driver.AppiumNativeDriver} with
 * **zero changes**. The objects are imported here byte-for-byte; only the
 * injected driver differs from the web path (ADR-0016 §platform seam).
 *
 * Gated on {@link ../appium-env.isNativeEmulatorConfigured}: skipped without an
 * emulator. To run it (locally or in the LS-8450 scheduled job) also requires a
 * league in draft state — provide its id via `E2E_NATIVE_DRAFT_LEAGUE_ID`. The
 * backend it drives is real until the per-worker GraphQL mock server (LS-8448)
 * can seed a draftable pool hermetically.
 */
import { test } from '@playwright/test';

import { isNativeEmulatorConfigured, NATIVE_ENV } from '../appium-env';
import { DraftPage } from '../../pages/draft.page';

test.describe('ADR-0016 reference migration on native — DraftPage', () => {
  let draftPage: DraftPage;
  let dispose: (() => Promise<void>) | undefined;

  test.beforeEach(async () => {
    test.skip(
      !isNativeEmulatorConfigured(),
      'requires a native emulator + a league in draft state (E2E_NATIVE_DRAFT_LEAGUE_ID)',
    );
    const { createAndroidSession } = await import('../appium-session');
    const session = await createAndroidSession();
    dispose = session.dispose;
    // The exact same page object the web suite constructs — only the driver
    // differs. This is the whole point of the platform seam.
    draftPage = new DraftPage(session.driver);
  });

  test.afterEach(async () => {
    await dispose?.();
    dispose = undefined;
  });

  test('draft board renders and player search filters via the shared verbs', async () => {
    const leagueId = Number(process.env[NATIVE_ENV.draftLeagueId] ?? '1');
    await draftPage.gotoLeague(leagueId);
    await draftPage.expectBoardVisible();
    await draftPage.expectPlayerPoolVisible();
    // PlayerSearchBox.fill via DraftPage.searchPlayer — the composed component's
    // verb, unchanged from web.
    await draftPage.searchPlayer('a');
  });
});
