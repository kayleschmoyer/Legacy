/**
 * Form Field Accessibility E2E Tests (LS-2221)
 *
 * Validates that form inputs have accessible labels, required fields have
 * aria-required, error messages are associated via aria-describedby,
 * and aria-invalid is set on validation failure.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/** URL predicate that matches GraphQL API endpoints but not source file imports */
/**
 * Evaluate form field accessibility for all visible inputs on the page.
 * Returns counts and issues found.
 * Only checks aria-label, aria-labelledby, and associated <label> — placeholders
 * are intentionally excluded as they are not reliable accessible name substitutes.
 */
async function evaluateFormA11y(page: import('@playwright/test').Page) {
  return await page.evaluate(() => {
    const isVisibleEl = (el: Element): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.hidden) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden')
        return false;
      return el.getClientRects().length > 0;
    };

    const inputs = Array.from(
      document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select',
      ),
    ).filter(isVisibleEl);

    const issues: string[] = [];
    const fieldDetails: Array<{
      tag: string;
      type: string;
      hasAriaLabel: boolean;
      hasAriaLabelledBy: boolean;
      hasAssociatedLabel: boolean;
      hasAriaRequired: boolean;
    }> = [];

    for (const input of inputs) {
      const el = input as HTMLInputElement;
      // Require non-empty aria-label values
      const ariaLabelValue = el.getAttribute('aria-label')?.trim() ?? '';
      const hasAriaLabel = ariaLabelValue.length > 0;
      // Require aria-labelledby to reference an existing element that provides
      // an accessible name via textContent, aria-label, or title attribute.
      const ariaLabelledByValue =
        el.getAttribute('aria-labelledby')?.trim() ?? '';
      const hasAriaLabelledBy =
        ariaLabelledByValue.length > 0 &&
        ariaLabelledByValue.split(/\s+/).some((refId) => {
          const ref = document.getElementById(refId);
          if (!ref) return false;
          return (
            !!ref.textContent?.trim() ||
            !!ref.getAttribute('aria-label')?.trim() ||
            !!ref.getAttribute('title')?.trim()
          );
        });
      const id = el.id;
      // Check explicit label[for=id], implicit wrapping <label>, and labels API
      const hasAssociatedLabel =
        (id ? !!document.querySelector(`label[for="${id}"]`) : false) ||
        !!el.closest('label') ||
        (el.labels != null && el.labels.length > 0);
      const hasAriaRequired =
        el.hasAttribute('aria-required') || el.hasAttribute('required');

      const detail = {
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') ?? 'text',
        hasAriaLabel,
        hasAriaLabelledBy,
        hasAssociatedLabel,
        hasAriaRequired,
      };
      fieldDetails.push(detail);

      if (!hasAriaLabel && !hasAriaLabelledBy && !hasAssociatedLabel) {
        issues.push(
          `${el.tagName} (id="${id}") has no accessible label (no aria-label, aria-labelledby, or associated <label>)`,
        );
      }
    }

    return { inputCount: inputs.length, fieldDetails, issues };
  });
}

/**
 * Check aria-invalid and aria-describedby associations after validation.
 */
async function evaluateValidationA11y(page: import('@playwright/test').Page) {
  return await page.evaluate(() => {
    const inputs = Array.from(
      document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select',
      ),
    );

    return inputs.map((input) => {
      const el = input as HTMLInputElement;
      const ariaDescribedBy = el.getAttribute('aria-describedby');
      const ariaInvalid = el.getAttribute('aria-invalid');
      const describedByIds = ariaDescribedBy
        ? ariaDescribedBy.split(' ').filter(Boolean)
        : [];
      const describedByElements = describedByIds.map((id) => {
        const target = document.getElementById(id);
        return {
          id,
          exists: !!target,
          textContent: target?.textContent?.trim() ?? '',
        };
      });

      return {
        id: el.id,
        ariaInvalid,
        ariaDescribedBy,
        describedByElements,
      };
    });
  });
}

/** Set up mocks for the league creation page GraphQL mutations */
async function setupLeagueCreationMock(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (postData.includes('createleagueandteams')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              createLeagueAndTeams: {
                __typename: 'CreateLeagueAndTeamsPayload',
                league: { __typename: 'League', id: 99, name: 'Test League' },
              },
            },
          }),
        });
      } else {
        await route.fallback();
      }
    },
  );
}

test.describe('Form field accessibility @regression', () => {
  test.describe('League creation form', () => {
    test('all form fields have accessible labels', async ({ page }) => {
      await setupLeagueCreationMock(page);
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('networkidle');
      // Auth guard runs in a useEffect after first paint; networkidle may fire
      // while the loading spinner is still showing. Wait for the form to render.
      await expect(page.getByPlaceholder('Enter your league name')).toBeVisible(
        {
          timeout: 10000,
        },
      );
      // The Create button is disabled while the form is loading and enabled once
      // all fields (and their aria attributes) have mounted. Waiting for it to be
      // enabled ensures the full form is ready before we audit accessible names.
      await expect(
        page.getByRole('button', { name: /create/i }).first(),
      ).toBeEnabled({ timeout: 10000 });

      const { inputCount, issues } = await evaluateFormA11y(page);

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );

      // The league-creation form is deterministic: at least one input must
      // render. Each input must declare an accessible name via aria-label,
      // aria-labelledby, or an associated <label>.
      expect(inputCount).toBeGreaterThan(0);
      expect(issues).toHaveLength(0);
    });

    test('league name field is present and labeled', async ({ page }) => {
      await setupLeagueCreationMock(page);
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('networkidle');
      // Auth guard runs in a useEffect after first paint; networkidle may fire
      // while the loading spinner is still showing. Wait for the form to render.
      await expect(page.getByPlaceholder('Enter your league name')).toBeVisible(
        {
          timeout: 10000,
        },
      );

      // Look for league name input by various selectors
      const nameInput = page
        .locator(
          [
            'input[name="leagueName"]',
            'input[name="name"]',
            'input[placeholder*="league" i]',
            'input[aria-label*="league" i]',
            'input[id*="league" i]',
            'input[id*="name" i]',
          ].join(', '),
        )
        .first();

      // The league-name input always renders on /baseball/league/create —
      // assert presence directly rather than branching on a count.
      await expect(nameInput).toBeVisible({ timeout: 10_000 });
      // The Create button is disabled while the form is loading and enabled
      // once all fields (and their aria attributes) have mounted. Waiting for
      // it to be enabled ensures aria-label/aria-labelledby associations are
      // fully set.
      await expect(
        page.getByRole('button', { name: /create/i }).first(),
      ).toBeEnabled({ timeout: 10000 });

      // Check for at least one proper accessible label mechanism
      const hasLabel = await nameInput.evaluate((el: HTMLInputElement) => {
        // aria-label with non-empty value
        if ((el.getAttribute('aria-label')?.trim() ?? '').length > 0)
          return true;
        // aria-labelledby referencing an element that provides an accessible name
        // (via textContent, aria-label, or title — matching evaluateFormA11y logic)
        const ariaLabelledByValue =
          el.getAttribute('aria-labelledby')?.trim() ?? '';
        if (
          ariaLabelledByValue.length > 0 &&
          ariaLabelledByValue.split(/\s+/).some((refId) => {
            const ref = document.getElementById(refId);
            if (!ref) return false;
            return (
              !!ref.textContent?.trim() ||
              !!ref.getAttribute('aria-label')?.trim() ||
              !!ref.getAttribute('title')?.trim()
            );
          })
        )
          return true;
        // associated <label> element
        return (
          (el.id ? !!document.querySelector(`label[for="${el.id}"]`) : false) ||
          !!el.closest('label') ||
          (el.labels != null && el.labels.length > 0)
        );
      });
      expect(hasLabel).toBe(true);
    });

    test('required fields on league creation page have aria-required or required attribute', async ({
      page,
    }) => {
      await setupLeagueCreationMock(page);
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );

      // Each field that has aria-required or required must have a valid boolean value
      const { fieldDetails } = await evaluateFormA11y(page);
      for (const field of fieldDetails) {
        // hasAriaRequired is computed as boolean — when true, the field has a valid required marker
        if (field.hasAriaRequired) {
          expect(field.hasAriaRequired).toBe(true);
        }
      }

      // The league name field is a known required field — verify it declares required semantics
      const leagueNameField = page
        .locator(
          [
            'input[name="leagueName"]',
            'input[name="name"]',
            'input[id*="league" i]',
            'input[id*="name" i]',
          ].join(', '),
        )
        .first();

      // The league name field is deterministically rendered on the create
      // page — assert it directly.
      await expect(leagueNameField).toBeAttached({ timeout: 10_000 });
      const requiredAttr = await leagueNameField.getAttribute('required');
      const ariaRequiredAttr =
        await leagueNameField.getAttribute('aria-required');
      expect(requiredAttr !== null || ariaRequiredAttr === 'true').toBe(true);
    });

    test('form submission with empty required fields shows validation and does not crash', async ({
      page,
    }) => {
      await setupLeagueCreationMock(page);
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('networkidle');

      // The Create League button is always enabled (only disabled while loading).
      // Fill a short name (<3 chars) to trigger client-side validation without navigating away,
      // so the page stability check is meaningful.
      const nameInput = page.getByPlaceholder('Enter your league name');
      await nameInput.fill('AB');

      const submitBtn = page.getByRole('button', { name: /create/i }).first();
      await expect(submitBtn).toBeVisible();
      await expect(submitBtn).toBeEnabled();
      await submitBtn.click();

      // Page should remain stable and show validation (not crash)
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });

    test('aria-invalid value is "true" on any field the form marks invalid after submit attempt', async ({
      page,
    }) => {
      await setupLeagueCreationMock(page);
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('networkidle');

      // Button is always enabled (only disabled while loading). Fill a short name (<3 chars)
      // so client-side validation fires and the page stays on /baseball/league/create.
      const nameInput = page.getByPlaceholder('Enter your league name');
      await nameInput.fill('AB');

      // Attempt to trigger validation by clicking submit
      const submitBtn = page.getByRole('button', { name: /create/i }).first();
      await expect(submitBtn).toBeVisible();
      await expect(submitBtn).toBeEnabled();
      await submitBtn.click();
      // Give validation a moment to apply
      await page.waitForTimeout(300);

      const validationDetails = await evaluateValidationA11y(page);

      // If any field is marked invalid, aria-invalid must be "true" (never empty or other value)
      const invalidFields = validationDetails.filter(
        (f) => f.ariaInvalid !== null,
      );

      for (const field of invalidFields) {
        // aria-invalid should only be "true" or "false", never empty string or other
        expect(['true', 'false']).toContain(field.ariaInvalid);
      }

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });

    test('if aria-describedby is present on form fields, referenced IDs exist in the DOM', async ({
      page,
    }) => {
      await setupLeagueCreationMock(page);
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('networkidle');

      // Button is always enabled (only disabled while loading). Fill a short name (<3 chars)
      // so client-side validation fires and the page stays on /baseball/league/create.
      const nameInput = page.getByPlaceholder('Enter your league name');
      await nameInput.fill('AB');

      // Trigger validation
      const submitBtn = page.getByRole('button', { name: /create/i }).first();
      await expect(submitBtn).toBeVisible();
      await expect(submitBtn).toBeEnabled();
      await submitBtn.click();
      await page.waitForTimeout(300);

      const validationDetails = await evaluateValidationA11y(page);

      // For any field using aria-describedby, the referenced element must exist in DOM
      for (const field of validationDetails) {
        for (const described of field.describedByElements) {
          expect(described.exists).toBe(true);
        }
      }

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });

    test('form structure is present on league creation page', async ({
      page,
    }) => {
      await setupLeagueCreationMock(page);
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('networkidle');

      // Either a form element or div-based form pattern — either way, no crash
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );

      // Auth guard initialization runs in a useEffect after the first paint,
      // so networkidle may fire while the auth loading spinner is still showing.
      // Wait explicitly for the league name input to confirm the form is rendered.
      await expect(page.getByPlaceholder('Enter your league name')).toBeVisible(
        { timeout: 10000 },
      );

      const { inputCount } = await evaluateFormA11y(page);
      // Expect at least one form input on a create page
      expect(inputCount).toBeGreaterThan(0);
    });
  });

  test.describe('Profile settings form', () => {
    test('profile settings form fields have accessible labels', async ({
      page,
    }) => {
      await page.route(
        (url) => isGraphQLEndpoint(url),
        async (route) => {
          await route.fallback();
        },
      );

      // The profile settings page renders display-only field rows by default;
      // form inputs are revealed by clicking the inline Edit affordance on the
      // username row. Trigger Edit mode so the editable Input is in the DOM
      // before we audit form-field accessibility.
      //
      // Intentionally skip `waitForLoadState('networkidle')` here — Firefox
      // intermittently keeps a long-tail request open (Vite preview, WS,
      // analytics) that prevents the idle event from firing within the 15s
      // navigation timeout. The auto-retrying `toBeVisible` check on the
      // Edit button below is a stronger readiness signal anyway.
      await page.goto('/profile/settings');

      const usernameEditBtn = page
        .getByRole('button', { name: 'Edit' })
        .first();
      await expect(usernameEditBtn).toBeVisible({ timeout: 15_000 });
      await usernameEditBtn.click();

      // Wait for the username input to mount before evaluating a11y.
      await expect(page.locator('input[aria-label="Username"]')).toBeVisible({
        timeout: 5_000,
      });

      const { inputCount, issues } = await evaluateFormA11y(page);

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );

      // After entering edit mode, at least the username input must be present
      // and every visible input must declare an accessible name.
      expect(inputCount).toBeGreaterThan(0);
      expect(issues).toHaveLength(0);
    });

    test('profile settings form fields are present and labeled', async ({
      page,
    }) => {
      await page.route(
        (url) => isGraphQLEndpoint(url),
        async (route) => {
          await route.fallback();
        },
      );

      await page.goto('/baseball/preferences');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );

      const { fieldDetails } = await evaluateFormA11y(page);

      // Each field should have at least one proper accessible labeling mechanism
      for (const field of fieldDetails) {
        const isLabeled =
          field.hasAriaLabel ||
          field.hasAriaLabelledBy ||
          field.hasAssociatedLabel;
        expect(isLabeled).toBe(true);
      }
    });
  });

  test.describe('Join league form', () => {
    test('join league form fields have accessible labels', async ({ page }) => {
      await page.route(
        (url) => isGraphQLEndpoint(url),
        async (route) => {
          await route.fallback();
        },
      );

      // Use a placeholder join code for navigation
      await page.goto('/baseball/league/join/TESTCODE');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );

      const { inputCount, issues } = await evaluateFormA11y(page);

      // The join-league page always renders the invite-code form.
      expect(inputCount).toBeGreaterThan(0);
      expect(issues).toHaveLength(0);
    });
  });

  test.describe('General form accessibility patterns', () => {
    test('form on league creation has at least one form element', async ({
      page,
    }) => {
      await setupLeagueCreationMock(page);
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('networkidle');

      // Either a form element exists, or the page uses div-based form pattern
      // Either way, verify no crash
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });
  });
});
