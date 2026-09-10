/**
 * Season renewal dialog — Phase 6 slice only (dual-mode, ADR-0016, LS-9737).
 *
 * Converted from season-renewal-migration-ui.integration.spec.ts Phase 6
 * ("Renewal dialog opens with roster options" — a dry run that cancels
 * without confirming). The source spec's Phases 1-5 (create a 4-team league,
 * join 3 managers, run an automated draft, fast-complete the season via API)
 * and Phases 7-10 (confirm renewal, verify the new/old league, migrate a
 * manager) are OUT of scope for this ticket and are not ported — only the
 * dialog-interaction slice is.
 *
 *   • Hermetic (default): `testData.seasonRenewalDialog()` installs the
 *     shared `setupSeasonRenewalGraphQL` fixture (already used by
 *     `season-renewal.spec.ts`), whose baseline league is already in the
 *     "season complete" state — no Phase 1-5 setup needed.
 *   • Live (`shared-live` project): reaching "season complete" on a real
 *     backend needs the full Phase 1-5 sequence, which no existing live
 *     TestData verb seeds (see `SEASON_RENEWAL_LIVE_UNSUPPORTED_REASON` in
 *     fixtures/test-data.ts) — the spec explicitly skips itself on the live
 *     backend rather than failing nightly CI on an unimplemented seed.
 */
import { test } from '../../fixtures/dual';

test.describe('Season renewal dialog — Phase 6 (dual-mode) @dual @regression', () => {
  test('renewal dialog opens with roster options and cancels without renewing', async ({
    leaguePage,
    testData,
  }) => {
    test.skip(
      testData.mode === 'live',
      'seasonRenewalDialog() has no live implementation yet — see ' +
        'SEASON_RENEWAL_LIVE_UNSUPPORTED_REASON in fixtures/test-data.ts',
    );

    const { leagueId, leagueName } = await testData.seasonRenewalDialog();

    await leaguePage.gotoDetail(leagueId, 'commissioner');
    await leaguePage.startNewSeasonButton.expectVisible({ timeout: 30000 });
    await leaguePage.startNewSeasonButton.tap();

    const dialog = leaguePage.renewalDialog;
    await dialog.expectVisible({ timeout: 10000 });
    await dialog.byText(/Start New Season for/i).expectVisible();
    await dialog.expectContainsText(leagueName);

    // Default selection is "Hold a new draft" — clearing copy is shown.
    await dialog
      .byText(/all team rosters will be cleared/i)
      .expectVisible({ timeout: 5000 });

    // Switch to "Keep same rosters" and confirm the descriptive copy updates.
    await dialog
      .byText(/keep same rosters/i)
      .first()
      .tap();
    await dialog
      .byText(/all current player assignments will be copied/i)
      .expectVisible({ timeout: 5000 });

    // Switch back — copy resets.
    await dialog
      .byText(/hold a new draft/i)
      .first()
      .tap();
    await dialog
      .byText(/all team rosters will be cleared/i)
      .expectVisible({ timeout: 5000 });

    // Cancel without confirming — no RenewLeague mutation should fire.
    // Tamagui's Dialog.Close with asChild may alter the button's ARIA role
    // depending on render mode (see season-renewal.spec.ts's Cancel test), so
    // match by visible text rather than role.
    await dialog.byText(/cancel/i).tap();
    await dialog.expectHidden({ timeout: 5000 });
  });
});
