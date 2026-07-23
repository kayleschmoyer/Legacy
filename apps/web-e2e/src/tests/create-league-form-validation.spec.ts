/**
 * Create League (Baseball) — Form Validation E2E Tests (LS-5369)
 *
 * QA-coverage Feature Story under LS-5262 (QA — Page: Create League —
 * Baseball). Asserts, end to end and hermetically, the six rules named in
 * the feature description:
 *   1. League name length (3–50 characters)
 *   2. Team / division parity
 *   3. Roster size stays within the sport's valid range
 *   4. Draft date cannot be set in the past
 *   5. Custom era range (start ≤ end, both required)
 *   6. Premium gating for FAAB waivers and historical eras
 *
 * Page-object migration (LS-8092 / ADR-0015): all locators live on
 * `leaguePage` — this spec is selector-free.
 */

import { customAuthTest, leagueTest as test } from '../fixtures/pages';
import { useTier } from '../fixtures/shared-mocks';

/** Free-tier identity, with page objects injected. */
const freeUserTest = customAuthTest('freeuser@test.com', 'none');

test.describe('Create League (Baseball) — Form Validation @regression', () => {
  // ─── League name length (3–50) ─────────────────────────────────────────

  test('shows a validation error when the league name is under 3 characters', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.fillLeagueName('Ab');
    await leaguePage.submitCreate();

    await leaguePage.alert.expectContainsText(
      'League name must be 3–50 characters.',
    );
  });

  test('hard-caps the league name input at 50 characters (LS-6055)', async ({
    leaguePage,
  }) => {
    // The input's maxLength attribute prevents both typing and fill() from
    // ever producing a value over the limit, so the "must be less than 50
    // characters" validation-message branch is covered at the unit level
    // instead (LeagueCreatePage.spec.tsx › validateFormFull — league name
    // length), where it's exercised directly against the pure validator.
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectAttribute('maxlength', '50');
  });

  test('accepts a league name within the 3–50 character range', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.fillLeagueName('Valid League Name');

    await leaguePage.text(/All settings look good/i).expectVisible();
  });

  // ─── Team / division parity ────────────────────────────────────────────

  test('switching to an odd team count restricts divisions to odd counts and stays valid', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.fillLeagueName('Parity League');

    // Default team count (12) is even and pairs with the default (even)
    // division count — no parity error.
    await leaguePage.text(/All settings look good/i).expectVisible();

    // Switch to an odd team count (7) — the form auto-resets the division
    // count to stay parity-valid and narrows the selectable options.
    await leaguePage.clickButton('7', { exact: true });

    await leaguePage
      .text(/With 7 teams, only odd division counts \(1, 3\) are allowed/i)
      .expectVisible();
    await leaguePage.text(/All settings look good/i).expectVisible();
  });

  // ─── Roster size ────────────────────────────────────────────────────────

  test('roster size selections stay within the valid 15–50 range', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.fillLeagueName('Roster League');
    await leaguePage.expandSection('roster-schedule');

    // The lowest and highest preset roster sizes for baseball (20 and 40)
    // both sit inside the valid 15–50 range — selecting either never
    // surfaces a roster validation error.
    await leaguePage.clickButton('20', { exact: true });
    await leaguePage.text(/All settings look good/i).expectVisible();

    await leaguePage.clickButton('40', { exact: true });
    await leaguePage.text(/All settings look good/i).expectVisible();
  });

  // ─── Future draft date ──────────────────────────────────────────────────

  test('past dates are disabled in the draft date picker; today is selectable', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.expandSection('draft');

    // Matches the picker's own per-cell key: `new Date(y, m, d)` (local
    // midnight) rendered via `.toISOString()`. Using `new Date()` (the
    // current instant, not midnight) here would drift a UTC day near
    // midnight depending on the runner's timezone.
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayKey = today.toISOString().slice(0, 10);

    // Open the picker — today's cell (current month view, no navigation) is
    // selectable.
    await leaguePage.clickText('Date…');
    await leaguePage.testId(`date-time-picker-day-${todayKey}`).expectEnabled();

    // Navigate back one full month — every day in that month is strictly
    // before the current month, so a mid-month day is unambiguously in the
    // past regardless of which day "today" is.
    await leaguePage.testId('date-time-picker-prev-month').tap();
    const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15);
    const prevMonthKey = prevMonth.toISOString().slice(0, 10);
    await leaguePage
      .testId(`date-time-picker-day-${prevMonthKey}`)
      .expectDisabled();
  });

  // ─── Custom era range ───────────────────────────────────────────────────

  test('custom era requires both years and start ≤ end', async ({
    page,
    leaguePage,
  }) => {
    // Custom Era is a premium-gated selection — establish premium before nav.
    await useTier(page, 'premium');
    await leaguePage.gotoCreate();
    // Avoid a league name containing "Custom Era" — the sidebar renders it
    // as a heading, which would collide with the era-card text below.
    await leaguePage.fillLeagueName('Vintage Sluggers League');
    await leaguePage.expandSection('era-history');
    await leaguePage.clickText('Custom Era');

    // Only a start year filled — both years are required.
    await leaguePage.placeholder('e.g. 1940').fill('1950');
    await leaguePage.submitCreate();
    await leaguePage.alert.expectContainsText(
      'Both custom-era boundary years are required.',
    );

    // Start year after end year — invalid range.
    await leaguePage.placeholder('e.g. 1960').fill('1940');
    await leaguePage.submitCreate();
    await leaguePage.alert.expectContainsText(
      "Custom era's first year must be on or before its last year.",
    );

    // A valid range clears the error.
    await leaguePage.placeholder('e.g. 1940').fill('1920');
    await leaguePage.text(/All settings look good/i).expectVisible();
  });

  // ─── Premium gating: FAAB waivers ───────────────────────────────────────

  freeUserTest(
    'free user selecting FAAB waivers sees the premium upgrade gate',
    async ({ page, leaguePage }) => {
      await useTier(page, 'free');
      await leaguePage.gotoCreate();
      await leaguePage.expandSection('waiver-budget');

      const faabButton = leaguePage.button(/FAAB/i).first();
      await faabButton.expectVisible({ timeout: 10000 });
      await faabButton.tap();

      await leaguePage.premiumGate.expectVisible({ timeout: 10000 });
    },
  );

  // ─── Premium gating: historical eras ────────────────────────────────────

  freeUserTest(
    'free user selecting a historical baseball era opens the upgrade modal',
    async ({ page, leaguePage }) => {
      await useTier(page, 'free');
      await leaguePage.gotoCreate();
      await leaguePage.expandSection('era-history');

      // "Dead Ball (pre-1920)" is a premium-only baseball era.
      await leaguePage.clickText(/Dead Ball \(pre-1920\)/i);

      await leaguePage
        .text(/Historical Era Selection/i)
        .first()
        .expectVisible({ timeout: 10000 });
    },
  );
});
