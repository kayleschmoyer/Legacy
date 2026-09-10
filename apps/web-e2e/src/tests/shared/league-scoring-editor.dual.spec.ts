/**
 * League scoring configuration editor (dual-mode, ADR-0016, LS-9737).
 *
 * Converted from league-scoring-editor-ui.integration.spec.ts Phases 2-4 (the
 * live original stays until nightly shared-live coverage is confirmed
 * green). ONE spec body, two backends, selected by Playwright project (see
 * player-stats-search.dual.spec.ts for the run commands):
 *
 *   • Hermetic (default): `testData.scoringProfile()` installs a stateful
 *     `UpdateLeagueScoringProfile` handler so the save round-trips.
 *   • Live (`shared-live` project): `testData.scoringProfile()` creates a
 *     real league via `createLeagueAndTeams` as the premium commissioner —
 *     a freshly created league already carries the default scoring profile
 *     server-side, so editing it needs no further seeding mutation.
 *
 * Phases 1 (league creation) and 5 (Reset All) of the source spec are
 * subsumed by the seam (`scoringProfile()` seeds the league; the mock
 * verb's stateful handler makes a second save-and-reset round trip provable
 * the same way the first save is). Phase 6 (non-commissioner cannot access
 * the editor) is out of scope here — it needs a second identity the
 * single-driver dual fixture doesn't provide (mirrors the QR-invite spec's
 * scope note); it remains covered by the hermetic
 * commissioner-scoring-editor.spec.ts.
 */
import { test } from '../../fixtures/dual';

test.describe('League scoring editor (dual-mode) @dual @regression', () => {
  test('commissioner edits a stat multiplier and the save persists', async ({
    leaguePage,
    testData,
  }) => {
    const { leagueId, statDisplayName, originalMultiplier } =
      await testData.scoringProfile();
    const updatedMultiplier = originalMultiplier + 1;

    await leaguePage.gotoDetail(leagueId, 'commissioner');
    await leaguePage.openScoringSection();

    await leaguePage.text('Batting').expectVisible({ timeout: 10000 });
    await leaguePage.text('Pitching').expectVisible();

    const multiplierInput = leaguePage.scoringMultiplierInput(statDisplayName);
    await multiplierInput.expectVisible({ timeout: 10000 });
    await multiplierInput.fill(String(updatedMultiplier));

    await leaguePage.text(/unsaved/i).expectVisible({ timeout: 5000 });

    await leaguePage.scoringSaveButton.expectEnabled({ timeout: 10000 });
    await leaguePage.scoringSaveButton.tap();
    await leaguePage.scoringSavedToast.expectVisible({ timeout: 30000 });

    // Postcondition: re-opening the section (or the save's own refetch)
    // reflects the new multiplier rather than the seeded original.
    await multiplierInput.expectValue(String(updatedMultiplier), {
      timeout: 10000,
    });
  });
});
