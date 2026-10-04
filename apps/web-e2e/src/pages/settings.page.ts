import { expect, type Page } from '@playwright/test';

import { type AppDriver, PlaywrightWebDriver, type UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';

/** Theme options rendered on the Preferences appearance chips. */
type PreferencesTheme = 'System' | 'Light' | 'Dark';
/** Default-sport options on the Preferences Sports & Stats section. */
type PreferencesSport = 'Baseball' | 'Football';
/** Stats-format options on the Preferences Sports & Stats section. */
type PreferencesStatsFormat = 'Standard' | 'Expanded';

/**
 * Page object for the settings / preferences / profile surfaces (ADR-0015 §1,
 * §4; ADR-0016 driver migration — LS-8456). Two distinct routes are modelled as
 * two grouped surfaces on one object (mirrors {@link ../pages/players.page}):
 *
 *   • `preferences` → `/preferences`      — appearance (theme chips, animations
 *                                            toggle), Sports & Stats (default
 *                                            sport, stats format, season totals),
 *                                            auto-save "Saved" banner. Stored in
 *                                            `localStorage` (`ls_user_preferences`)
 *                                            — there is NO GraphQL for this page,
 *                                            so the localStorage/`page.evaluate`
 *                                            reset stays in the spec (ADR-0015 §6).
 *   • `profile`     → `/profile/settings`  — profile fields, Google-managed info
 *                                            banner, App Avatar, Account &
 *                                            Security, Linked Identities, 2FA,
 *                                            Sign Out, and the a11y landmarks.
 *
 * Locators are PRIVATE; specs interact only through the semantic verbs
 * (actions / reads / assertions). Page objects carry no mocking or data setup —
 * the profile specs keep their `page.route` GraphQL/MFA mocks and the
 * preferences specs keep their `localStorage` reset; navigation and element
 * access live here.
 *
 * The Preferences page ships no `data-testid` attributes on its controls yet
 * (only the `prefs-save-banner`), so the appearance/sports controls are located
 * by ARIA role (`radio` / `switch`) and by rendered copy — the selector layer is
 * exactly where those role/text queries belong.
 *
 * ADR-0016 migration status: the `preferences` surface is fully platform-neutral
 * (driver-typed only). The `profile` surface is driver-typed with a slim,
 * DOCUMENTED web-only remainder reached via the Playwright `Page` escape hatch
 * (constructed alongside the driver): a whole-node `toHaveText` on the 2FA
 * error alert, which has no portable driver verb (the vocabulary offers
 * substring `expectContainsText`, not exact text). Because of that remainder,
 * constructing this object REQUIRES the web driver.
 */
export class SettingsPage extends BaseScreen {
  /** `/preferences` surface (driver-typed — platform neutral). */
  readonly preferences: PreferencesSurface;
  /** `/profile/settings` surface. */
  readonly profile: ProfileSurface;

  constructor(driver: AppDriver) {
    super(driver);
    if (!(driver instanceof PlaywrightWebDriver)) {
      throw new Error(
        'SettingsPage requires the web driver: its profile surface keeps a ' +
          'documented web-only remainder (exact 2FA-alert text) reached via ' +
          'the Page escape hatch (LS-8456).',
      );
    }
    this.preferences = new PreferencesSurface(driver);
    this.profile = new ProfileSurface(driver, driver.page);
  }
}

// ===========================================================================
// /preferences
// ===========================================================================

/**
 * Semantic surface for the `/preferences` page. Fully platform-neutral: every
 * read/action/assertion resolves through the {@link AppDriver}. Preferences
 * persist to `localStorage` (`ls_user_preferences`); that reset stays in the
 * spec, not here.
 */
class PreferencesSurface {
  readonly #driver: AppDriver;
  readonly #heading: UIElement;
  readonly #saveBanner: UIElement;
  readonly #animationsToggle: UIElement;
  readonly #signInButton: UIElement;

  constructor(driver: AppDriver) {
    this.#driver = driver;
    this.#heading = driver.byRole('heading', { name: 'Preferences' });
    this.#saveBanner = driver.byTestId('prefs-save-banner');
    // The animations control is an ARIA switch labelled "Animations".
    this.#animationsToggle = driver.byRole('switch', { name: 'Animations' });
    this.#signInButton = driver.byRole('button', { name: /sign in/i });
  }

  // ── Private parameterised locators ────────────────────────────────

  #themeRadio(name: PreferencesTheme): UIElement {
    return this.#driver.byRole('radio', { name });
  }

  #sportRadio(name: PreferencesSport): UIElement {
    return this.#driver.byRole('radio', { name });
  }

  #statsFormatRadio(name: PreferencesStatsFormat): UIElement {
    return this.#driver.byRole('radio', { name });
  }

  // ── Navigation ────────────────────────────────────────────────────

  /**
   * Navigate to `/preferences` and wait for the page heading. Gate on the
   * heading (a stable, role-based signal) rather than `networkidle` — the page
   * is localStorage-only, so it renders the heading on first paint. The heading
   * is present both authenticated and signed out.
   */
  async goto(): Promise<void> {
    await this.#driver.open('/preferences');
    await this.#heading.expectVisible();
  }

  // ── Actions ───────────────────────────────────────────────────────

  /** Select a theme chip (System / Light / Dark). */
  async selectTheme(name: PreferencesTheme): Promise<void> {
    await this.#themeRadio(name).tap();
  }

  /** Select a default-sport chip (Baseball / Football). */
  async selectDefaultSport(name: PreferencesSport): Promise<void> {
    await this.#sportRadio(name).tap();
  }

  /** Select a stats-format chip (Standard / Expanded). */
  async selectStatsFormat(name: PreferencesStatsFormat): Promise<void> {
    await this.#statsFormatRadio(name).tap();
  }

  /** Toggle the Animations switch. */
  async toggleAnimations(): Promise<void> {
    await this.#animationsToggle.tap();
  }

  /** Click the "Sign In" CTA shown in the signed-out notifications card. */
  async clickSignIn(): Promise<void> {
    await this.#signInButton.tap();
  }

  // ── Reads ─────────────────────────────────────────────────────────

  /** Whether the Animations switch is currently on (`aria-checked="true"`). */
  async animationsChecked(): Promise<boolean> {
    return (await this.#animationsToggle.attribute('aria-checked')) === 'true';
  }

  // ── Assertions ────────────────────────────────────────────────────

  /** Assert the "Preferences" heading is visible. */
  async expectHeading(): Promise<void> {
    await this.#heading.expectVisible();
  }

  /** Assert the auto-save subtitle ("…save automatically…") is visible. */
  async expectAutoSaveSubtitle(): Promise<void> {
    await this.#driver.byText(/save automatically/i).expectVisible();
  }

  /** Assert the Appearance heading is visible (exact). */
  async expectAppearanceHeading(): Promise<void> {
    await this.#driver.byText('Appearance', { exact: true }).expectVisible();
  }

  /** Assert the Appearance section (heading + "Theme · Animations" subtitle). */
  async expectAppearanceSection(): Promise<void> {
    await this.expectAppearanceHeading();
    await this.#driver
      .byText('Theme · Animations', { exact: true })
      .expectVisible();
  }

  /** Assert the Theme label is visible (exact). */
  async expectThemeLabel(timeout?: number): Promise<void> {
    await this.#driver
      .byText('Theme', { exact: true })
      .first()
      .expectVisible({ timeout });
  }

  /** Assert a theme chip (System / Light / Dark) is visible. */
  async expectThemeOptionVisible(
    name: PreferencesTheme,
    timeout?: number,
  ): Promise<void> {
    await this.#themeRadio(name).expectVisible({ timeout });
  }

  /** Assert a theme chip is the selected one (`aria-checked="true"`). */
  async expectThemeSelected(
    name: PreferencesTheme,
    timeout?: number,
  ): Promise<void> {
    await this.#themeRadio(name).expectAttribute('aria-checked', 'true', {
      timeout,
    });
  }

  /** Assert the Animations row (label + description) is visible. */
  async expectAnimationsRow(): Promise<void> {
    await this.#driver.byText('Animations', { exact: true }).expectVisible();
    await this.#driver
      .byText(/Page transitions and micro-motion/)
      .expectVisible();
  }

  /** Assert the Animations switch is visible. */
  async expectAnimationsToggleVisible(): Promise<void> {
    await this.#animationsToggle.expectVisible();
  }

  /** Assert the Animations switch's `aria-checked` state. */
  async expectAnimationsChecked(checked: boolean): Promise<void> {
    await this.#animationsToggle.expectAttribute(
      'aria-checked',
      checked ? 'true' : 'false',
    );
  }

  /** Assert the Sports & Stats section (heading + subtitle). */
  async expectSportsStatsSection(): Promise<void> {
    await this.#driver
      .byText('Sports & Stats', { exact: true })
      .expectVisible();
    await this.#driver
      .byText('Default sport · Format · Totals', { exact: true })
      .expectVisible();
  }

  /** Assert the Default sport label is visible (exact). */
  async expectDefaultSportLabel(): Promise<void> {
    await this.#driver.byText('Default sport', { exact: true }).expectVisible();
  }

  /** Assert a default-sport chip (Baseball / Football) is visible. */
  async expectSportOptionVisible(name: PreferencesSport): Promise<void> {
    await this.#sportRadio(name).expectVisible();
  }

  /** Assert the Stats format label is visible (exact). */
  async expectStatsFormatLabel(): Promise<void> {
    await this.#driver.byText('Stats format', { exact: true }).expectVisible();
  }

  /** Assert a stats-format chip (Standard / Expanded) is visible. */
  async expectStatsFormatOptionVisible(
    name: PreferencesStatsFormat,
  ): Promise<void> {
    await this.#statsFormatRadio(name).expectVisible();
  }

  /** Assert the Show-season-totals row (label + description) is visible. */
  async expectSeasonTotalsRow(): Promise<void> {
    await this.#driver
      .byText('Show season totals', { exact: true })
      .expectVisible();
    await this.#driver.byText(/Append running season numbers/).expectVisible();
  }

  /** Assert the auto-save "Saved" banner is visible. */
  async expectSaveBanner(timeout?: number): Promise<void> {
    await this.#saveBanner.expectVisible({ timeout });
  }

  // ── Assertions: signed-out notifications card ─────────────────────

  /** Assert the signed-out notifications sign-in card copy is visible. */
  async expectNotificationsSignInCard(): Promise<void> {
    await this.#driver.byText('Sign in to set alerts').expectVisible();
    await this.#driver
      .byText(/Push, email, and matchup alerts live with your account/)
      .expectVisible();
  }

  /** Assert the authed "Push notifications" toggle is absent from the DOM. */
  async expectPushNotificationsAbsent(): Promise<void> {
    await this.#driver
      .byText('Push notifications', { exact: true })
      .expectCount(0);
  }
}

// ===========================================================================
// /profile/settings
// ===========================================================================

/**
 * Semantic surface for the `/profile/settings` page (ADR-0016). Driver-typed
 * reads/actions/assertions resolve through the {@link AppDriver}. A slim,
 * DOCUMENTED web-only remainder reaches the Playwright `Page`:
 *   • the exact `toHaveText` on the 2FA error alert — the driver vocabulary
 *     offers substring `expectContainsText`, not a whole-node text match.
 * Everything else on the page is expressed as a portable verb.
 *
 * The page's GraphQL (GetUserById / MyIdentities / SetCanonicalEmail) and MFA
 * HTTP routes are mocked in the SPEC via `page.route`; this surface carries no
 * mocking or identity setup.
 */
class ProfileSurface {
  readonly #driver: AppDriver;
  /** Web escape hatch for the documented web-only remainder (see class doc). */
  readonly #page: Page;
  readonly #heading: UIElement;
  readonly #headingLoose: UIElement;
  readonly #logo: UIElement;
  readonly #linkedIdentities: UIElement;
  readonly #enable2fa: UIElement;
  readonly #disable2fa: UIElement;
  readonly #verifyButton: UIElement;
  readonly #codeInput: UIElement;
  readonly #enrollFlow: UIElement;
  readonly #signOutButton: UIElement;
  readonly #continueWithGoogle: UIElement;
  readonly #mainLandmark: UIElement;
  readonly #primaryNav: UIElement;
  readonly #alert: UIElement;

  constructor(driver: AppDriver, page: Page) {
    this.#driver = driver;
    this.#page = page;
    this.#heading = driver.byRole('heading', { name: 'Profile Settings' });
    this.#headingLoose = driver.byRole('heading', {
      name: /profile settings/i,
    });
    this.#logo = driver.byTestId('header-logo');
    this.#linkedIdentities = driver.byTestId(
      'profile-linked-identities-section',
    );
    this.#enable2fa = driver.byRole('button', { name: /Enable 2FA/i });
    this.#disable2fa = driver.byRole('button', { name: /Disable 2FA/i });
    this.#verifyButton = driver.byRole('button', { name: /Verify/i });
    this.#codeInput = driver.byTestId('2fa-code-input');
    this.#enrollFlow = driver.byTestId('2fa-enroll-flow');
    this.#signOutButton = driver.byRole('button', { name: /sign out/i });
    this.#continueWithGoogle = driver.byRole('button', {
      name: /continue with google/i,
    });
    this.#mainLandmark = driver.byRole('main');
    this.#primaryNav = driver.byRole('navigation', { name: 'Primary' });
    this.#alert = driver.byRole('alert');
  }

  // ── Navigation ────────────────────────────────────────────────────

  /**
   * Navigate to `/profile/settings`. No readiness gate here: authenticated
   * specs gate on their first retrying assertion, while the unauthenticated
   * guard renders the login page in-place (no heading), so a shared heading
   * wait would be wrong. `driver.open` resolves after the `load` event.
   */
  async goto(): Promise<void> {
    await this.#driver.open('/profile/settings');
  }

  // ── Actions ───────────────────────────────────────────────────────

  /** Click a preset avatar tile in the App Avatar picker (LS-7212). */
  async selectAvatarPreset(label: string): Promise<void> {
    await this.#driver.byRole('img', { name: label, exact: true }).tap();
  }

  /** Type a URL into the App Avatar picker's custom-URL input (LS-7212). */
  async fillCustomAvatarUrl(url: string): Promise<void> {
    await this.#driver.byLabel('Custom avatar URL').fill(url);
  }

  /** Click the picker's custom-URL "Apply" button (LS-7212). */
  async clickApplyCustomAvatarUrl(): Promise<void> {
    await this.#driver.byRole('button', { name: 'Apply' }).tap();
  }

  /** Click the picker's "Save" button (LS-7212). The avatar section is the
   * last "Save" on the page — the username editor's Save only renders while
   * editing. */
  async clickSaveAvatar(): Promise<void> {
    await this.#driver.byRole('button', { name: 'Save' }).last().tap();
  }

  /** Click the picker's "Clear" button (LS-7212). */
  async clickClearAvatar(): Promise<void> {
    await this.#driver.byRole('button', { name: 'Clear' }).tap();
  }

  /** Assert the picker preview caption (LS-7212). */
  async expectAvatarPreviewCaption(
    caption: 'Custom URL or preset selected' | 'No image selected',
  ): Promise<void> {
    await this.#driver.byText(caption, { exact: true }).expectVisible();
  }

  /** Click the "Set as primary" button for a non-canonical identity. */
  async clickSetAsPrimary(): Promise<void> {
    await this.#driver.byRole('button', { name: 'Set as primary' }).tap();
  }

  /** Enter username edit mode and replace the input value with `value`. */
  async editUsername(value: string): Promise<void> {
    await this.#driver.byText('Edit', { exact: true }).first().tap();
    await this.#driver.byLabel('Username', { exact: true }).fill(value);
  }

  /** Click the username editor's "Save" button. */
  async saveUsername(): Promise<void> {
    // The username editor precedes the other "Save" button on the page.
    await this.#driver
      .byRole('button', { name: 'Save', exact: true })
      .first()
      .tap();
  }

  /** Click "Enable 2FA" (waits for it to be actionable first). */
  async clickEnable2fa(timeout = 10_000): Promise<void> {
    await this.#enable2fa.expectVisible({ timeout });
    await this.#enable2fa.tap();
  }

  /** Click "Disable 2FA". Any confirm dialog is handled in the spec. */
  async clickDisable2fa(): Promise<void> {
    await this.#disable2fa.tap();
  }

  /** Fill the 2FA verification code input. */
  async fill2faCode(code: string): Promise<void> {
    await this.#codeInput.fill(code);
  }

  /** Click the 2FA "Verify" button. */
  async clickVerify(): Promise<void> {
    await this.#verifyButton.tap();
  }

  // ── Reads ─────────────────────────────────────────────────────────

  /** The header logo's `alt` attribute (or null when absent). */
  async logoAltText(): Promise<string | null> {
    return this.#logo.attribute('alt');
  }

  // ── Assertions: page + profile section ────────────────────────────

  /** Assert the "Profile Settings" heading is visible. */
  async expectHeading(): Promise<void> {
    await this.#heading.expectVisible();
  }

  /** Assert the "Profile Settings" heading is NOT visible (unauth guard). */
  async expectHeadingHidden(): Promise<void> {
    await this.#headingLoose.expectHidden();
  }

  /** Assert the Profile section (heading + public-identity subtitle). */
  async expectProfileSection(): Promise<void> {
    await this.#driver
      .byText('Profile', { exact: true })
      .first()
      .expectVisible();
    await this.#driver
      .byText('Your public identity on Legacy Sports')
      .expectVisible();
  }

  /** Assert the Username field label is visible. */
  async expectUsernameField(): Promise<void> {
    await this.#driver.byText('Username', { exact: true }).expectVisible();
  }

  /** Assert a username validation error (exact copy or pattern) is shown. */
  async expectUsernameError(message: string | RegExp): Promise<void> {
    await this.#driver.byText(message).expectVisible();
  }

  /** Assert the Email field label is visible. */
  async expectEmailField(): Promise<void> {
    await this.#driver.byText('Email', { exact: true }).expectVisible();
  }

  /** Assert the User ID field label is visible. */
  async expectUserIdField(): Promise<void> {
    await this.#driver.byText('User ID').expectVisible();
  }

  /** Assert the Access Level field label is visible. */
  async expectAccessLevelField(): Promise<void> {
    await this.#driver.byText('Access Level').expectVisible();
  }

  /** Assert the Google-managed profile info banner is visible. */
  async expectGoogleManagedBanner(): Promise<void> {
    await this.#driver
      .byText(/Email and profile photo are managed through your Google account/)
      .expectVisible();
  }

  /** Assert the App Avatar section (heading + description) is visible. */
  async expectAppAvatarSection(): Promise<void> {
    await this.#driver.byText('App Avatar').expectVisible();
    await this.#driver
      .byText(/Choose a custom avatar displayed in chat/)
      .expectVisible();
  }

  /** Assert the page meta description is visible. */
  async expectMetaDescription(): Promise<void> {
    await this.#driver
      .byText(/Manage your account information and preferences/)
      .expectVisible();
  }

  // ── Assertions: Account & Security / session / sign out ───────────

  /** Assert the Account & Security section (heading + sign-in method rows). */
  async expectAccountSecuritySection(): Promise<void> {
    await this.#driver.byText('Account & Security').expectVisible();
    await this.#driver.byText('Sign-in Method').expectVisible();
    await this.#driver.byText('Google OAuth').expectVisible();
  }

  /** Assert the active-session indicator (Session + Active) is visible. */
  async expectActiveSession(): Promise<void> {
    await this.#driver
      .byText('Session', { exact: true })
      .first()
      .expectVisible();
    await this.#driver
      .byText('Active', { exact: true })
      .first()
      .expectVisible();
  }

  /** Assert the Sign Out button is visible. */
  async expectSignOutButton(): Promise<void> {
    await this.#signOutButton.expectVisible();
  }

  /** Assert the sign-out description copy is visible. */
  async expectSignOutDescription(): Promise<void> {
    await this.#driver
      .byText(
        /You will be signed out of your Legacy Sports account and redirected to the login page/,
      )
      .expectVisible();
  }

  // ── Assertions: Linked Identities (LS-7825) ───────────────────────

  /** Assert the Linked Identities section (container + heading) is visible. */
  async expectLinkedIdentitiesSection(): Promise<void> {
    await this.#linkedIdentities.expectVisible();
    await this.#driver.byText('Linked Identities').expectVisible();
  }

  /** Assert the "Primary email" badge is visible. */
  async expectPrimaryEmailBadge(): Promise<void> {
    await this.#driver.byText('Primary email').expectVisible();
  }

  /**
   * Assert a provider name is visible inside the Linked Identities section.
   * Scoped to the section because a bare "Google" also matches the info banner
   * and the "Google OAuth" sign-in row.
   */
  async expectIdentityProviderInSection(name: string): Promise<void> {
    await this.#linkedIdentities.byText(name, { exact: true }).expectVisible();
  }

  /** Assert the "Set as primary" control is visible (by text). */
  async expectSetAsPrimaryVisible(): Promise<void> {
    await this.#driver.byText('Set as primary').expectVisible();
  }

  /** Assert the "Set as primary" button is visible (by role + name). */
  async expectSetAsPrimaryButton(): Promise<void> {
    await this.#driver
      .byRole('button', { name: 'Set as primary' })
      .expectVisible();
  }

  /** Assert at least one "Disconnect" control is visible. */
  async expectDisconnectVisible(): Promise<void> {
    await this.#driver.byText('Disconnect').first().expectVisible();
  }

  // ── Assertions: a11y landmarks (LS-3507) ──────────────────────────

  /** Assert the header logo is attached to the DOM. */
  async expectLogoAttached(timeout = 15_000): Promise<void> {
    await this.#logo.expectAttached({ timeout });
  }

  /** Assert the `<main>` landmark is visible. */
  async expectMainLandmark(timeout = 15_000): Promise<void> {
    await this.#mainLandmark.expectVisible({ timeout });
  }

  /** Assert the primary navigation landmark is visible. */
  async expectPrimaryNavLandmark(timeout = 15_000): Promise<void> {
    await this.#primaryNav.expectVisible({ timeout });
  }

  // ── Assertions: Two-Factor Authentication (LS-7833) ───────────────

  /** Assert the Two-Factor Authentication section (heading + description). */
  async expectTwoFactorSection(): Promise<void> {
    await this.#driver.byText('Two-Factor Authentication').expectVisible();
    await this.#driver
      .byText('Add an extra layer of security to your account')
      .expectVisible();
  }

  /** Assert the "Enable 2FA" button is visible. */
  async expectEnable2faButton(timeout = 10_000): Promise<void> {
    await this.#enable2fa.expectVisible({ timeout });
  }

  /** Assert the "Enable 2FA" button is NOT visible. */
  async expectEnable2faButtonHidden(): Promise<void> {
    await this.#enable2fa.expectHidden();
  }

  /** Assert the "Disable 2FA" button is visible. */
  async expectDisable2faButton(timeout = 10_000): Promise<void> {
    await this.#disable2fa.expectVisible({ timeout });
  }

  /** Assert the "Disable 2FA" button is NOT visible. */
  async expectDisable2faButtonHidden(): Promise<void> {
    await this.#disable2fa.expectHidden();
  }

  /** Assert the 2FA enrollment flow container is visible. */
  async expect2faEnrollFlow(timeout = 10_000): Promise<void> {
    await this.#enrollFlow.expectVisible({ timeout });
  }

  /** Assert the 2FA code input is visible. */
  async expect2faCodeInput(timeout?: number): Promise<void> {
    await this.#codeInput.expectVisible({ timeout });
  }

  /** Assert the 2FA "Verify" button is visible. */
  async expectVerifyButton(): Promise<void> {
    await this.#verifyButton.expectVisible();
  }

  /**
   * Assert the 2FA error alert shows exactly `text`. WEB-ONLY: `toHaveText`
   * (whole-node match) has no portable driver assertion — the vocabulary offers
   * substring `expectContainsText`, not an exact text match — so this stays on
   * the raw `Page` to preserve the original assertion strength.
   */
  async expect2faError(text: string): Promise<void> {
    await this.#alert.expectVisible({ timeout: 5_000 });
    await expect(this.#page.getByRole('alert')).toHaveText(text);
  }

  // ── Assertions: unauthenticated guard (LS-3506) ───────────────────

  /** Assert the "Continue with Google" sign-in CTA is visible. */
  async expectContinueWithGoogle(timeout = 15_000): Promise<void> {
    await this.#continueWithGoogle.expectVisible({ timeout });
  }
}
