/**
 * Football Roster (My Roster) lineup editing — dual-mode (LS-9656, parent
 * LS-8444).
 *
 * `RosterPage` (`apps/web-e2e/src/pages/roster.page.ts`) already speaks the
 * platform-neutral `AppDriver` vocabulary (ADR-0016 §platform seam) and
 * renders the SAME `RosterBoardV2` shared component
 * (`lib/shared-components/src/features/roster/**`) on web
 * (`apps/web/src/pages/baseball/league-detail-v2/tabs/Roster.tsx`) and native
 * (`apps/app/src/features/roster/LeagueRosterManagement.tsx`) — but until now
 * only the web-only hermetic `football-roster-lineup.spec.ts` proved the
 * bench→starter assignment mutation actually works. This spec converts that
 * coverage into the shared dual-mode suite so the SAME spec body runs
 * mocked on web (PR CI) and through a real Appium/UiAutomator2 session on
 * native-android (`.github/workflows/e2e-native-android.yml`), closing the
 * "no test proves the native path works at all" gap.
 *
 * `TestData.footballLineup()` (LS-9655) is mock-only — see
 * `FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON` in `fixtures/test-data.ts` — so
 * this spec runs against the `chromium` (hermetic mock) and `native-android`
 * (native mock server, ADR-0017) projects. On `shared-live` — whose
 * `testDir` is all of `src/tests/shared/` — it skips itself (LS-10217).
 *
 * `football-roster-lineup.spec.ts` keeps only the position-grouping render
 * assertion (a web-rendering-only concern with no native page-object
 * equivalent yet); the bench↔starter assignment mutation, its UI reflection,
 * and reload persistence now live here instead of in both places.
 *
 * Deliberately speaks ONLY the `AppDriver` vocabulary (`rosterPage`) — no
 * `page.waitForRequest`/`page.route()` network assertions. The native mock
 * server (ADR-0017) is a real out-of-process HTTP server the emulator app
 * talks to directly over `adb reverse`; it never crosses the Playwright
 * `page`'s network stack, so a `page.waitForRequest` gate — the pattern the
 * web-only predecessor used — would hang forever on `native-android`. The
 * retrying `expectVisible` on the post-mutation UI state is the
 * platform-neutral equivalent.
 */
import { test } from '../../fixtures/dual';

test.describe('Football Roster lineup (dual-mode) @dual @regression', () => {
  test('moving a bench player into an open starting slot fires the mutation, updates the UI, and persists on reload', async ({
    testData,
    rosterPage,
  }) => {
    test.skip(
      testData.mode === 'live',
      'footballLineup() has no live implementation (LS-9655) — see ' +
        'FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON in fixtures/test-data.ts',
    );

    const lineup = await testData.footballLineup();
    const { fullName } = lineup.benchPlayer;
    const { positionType } = lineup.openSlot;

    await rosterPage.goto(lineup.leagueId, 'football');
    await rosterPage.expectNoAppError();

    await rosterPage
      .slotButton(new RegExp(`${fullName} — bench`, 'i'))
      .expectVisible({ timeout: 15_000 });

    await test.step('Assign the bench player to the open slot', async () => {
      await rosterPage.slotButton(new RegExp(`${fullName} — bench`, 'i')).tap();
      await rosterPage
        .slotButton(new RegExp(`assign ${fullName} to ${positionType}`, 'i'))
        .tap();

      await rosterPage
        .assignedSlot(fullName, positionType)
        .expectVisible({ timeout: 15_000 });
    });

    await test.step('The assignment persists across a reload', async () => {
      await rosterPage.goto(lineup.leagueId, 'football');
      await rosterPage
        .assignedSlot(fullName, positionType)
        .expectVisible({ timeout: 15_000 });
    });
  });
});
