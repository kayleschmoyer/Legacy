/**
 * League QR code & invite link (dual-mode, ADR-0016, LS-9737).
 *
 * Converted from league-qr-invite-ui.integration.spec.ts Phases 2, 3, 5 and
 * the backend-verification half of Phases 7-8 (the live original stays until
 * nightly shared-live coverage is confirmed green). ONE spec body, two
 * backends, selected by Playwright project (see
 * player-stats-search.dual.spec.ts for the run commands):
 *
 *   • Hermetic (default): `testData.leagueInvite()` installs a league/team
 *     fixture the commissioner owns, so the Invite Friends card renders a
 *     known invite code with no backend round trip.
 *   • Live (`shared-live` project): `testData.leagueInvite()` creates a real
 *     league via `createLeagueAndTeams` as the premium commissioner.
 *
 * The join half of the source spec (Phase 7: "Manager joins via the invite
 * URL") is intentionally NOT UI-driven here — the dual fixture's single
 * `page`/`driver` is already authenticated as the commissioner, so there is
 * no second browser context to drive the join form with. `testData.
 * inviteJoin()` performs the join directly against the backend instead (see
 * its doc comment in fixtures/test-data.ts) and the spec asserts the same
 * `memberCount` postcondition Phase 8 checked via API.
 */
import { expect, test } from '../../fixtures/dual';

test.describe('League QR code & invite link (dual-mode) @dual @regression', () => {
  test('commissioner sees the Invite Friends card, copies both fields, and a join increases membership', async ({
    leaguePage,
    testData,
  }) => {
    const invite = await testData.leagueInvite();

    await leaguePage.gotoDetail(invite.leagueId, 'overview');
    await leaguePage.inviteFriendsHeading.expectVisible({ timeout: 15000 });

    await leaguePage.copyInviteLinkButton.expectVisible({ timeout: 10000 });
    await leaguePage.copyInviteCodeButton.expectVisible();

    // Phase 5 — QR code toggle.
    await leaguePage.qrCodeSvg.expectHidden();
    await leaguePage.showQrCode();
    await leaguePage.qrCodeSvg.expectVisible({ timeout: 10000 });
    await leaguePage.hideQrCode();
    await leaguePage.qrCodeSvg.expectHidden({ timeout: 5000 });

    // Backend postcondition (Phases 7-8 of the source spec, API-verified
    // rather than UI-driven — see the doc comment above).
    const { memberCount } = await testData.inviteJoin(
      invite,
      'QR Code Joiners',
    );
    expect(memberCount).toBeGreaterThanOrEqual(2);
  });
});
