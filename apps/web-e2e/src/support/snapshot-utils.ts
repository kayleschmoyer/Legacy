import { expect, Page } from '@playwright/test';

/**
 * Utility functions for snapshot testing
 */
export class SnapshotUtils {
  /**
   * Prepare page for consistent snapshots by hiding dynamic content
   */
  static async preparePage(page: Page): Promise<void> {
    await page.addStyleTag({
      content: `
        /* Hide dynamic elements that change between test runs */
        [data-testid="timestamp"],
        .timestamp,
        .time,
        [class*="time"],
        [id*="time"],
        [data-testid="current-time"],
        .loading-spinner,
        .spinner,
        .animate-spin,
        [class*="animate"],
        [data-testid="loading"] {
          visibility: hidden !important;
        }
        
        /* Disable animations for consistent snapshots */
        *,
        *::before,
        *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          transform: none !important;
        }
        
        /* Hide scrollbars */
        ::-webkit-scrollbar {
          display: none !important;
        }
        
        /* Ensure consistent focus states */
        *:focus {
          outline: 2px solid #0066cc !important;
          outline-offset: 2px !important;
        }
      `,
    });
  }

  /**
   * Clean dynamic attributes from DOM for HTML snapshots
   */
  static async cleanDynamicAttributes(page: Page): Promise<void> {
    await page.evaluate(() => {
      // Remove dynamic React attributes
      const reactElements = document.querySelectorAll(
        '[data-reactroot], [data-react-*]'
      );
      reactElements.forEach((el) => {
        const attrs = el.attributes;
        for (let i = attrs.length - 1; i >= 0; i--) {
          const attr = attrs[i];
          if (
            attr.name.startsWith('data-react') ||
            attr.name === 'data-reactroot'
          ) {
            el.removeAttribute(attr.name);
          }
        }
      });

      // Remove dynamic IDs (numeric only)
      const elementsWithIds = document.querySelectorAll('[id]');
      elementsWithIds.forEach((el) => {
        const id = el.getAttribute('id');
        if (id && /^\d+$/.test(id)) {
          el.removeAttribute('id');
        }
      });

      // Remove style attributes that might contain dynamic values
      const elementsWithStyle = document.querySelectorAll('[style]');
      elementsWithStyle.forEach((el) => {
        const style = el.getAttribute('style');
        if (style && style.includes('transform')) {
          el.removeAttribute('style');
        }
      });
    });
  }

  /**
   * Take a full page screenshot with consistent settings
   */
  static async takeFullPageScreenshot(page: Page, name: string): Promise<void> {
    await this.preparePage(page);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot(name, {
      fullPage: true,
      animations: 'disabled',
      threshold: 0.2,
    });
  }

  /**
   * Take a component screenshot with consistent settings
   */
  static async takeComponentScreenshot(
    page: Page,
    selector: string,
    name: string
  ): Promise<void> {
    await this.preparePage(page);
    const element = page.locator(selector);

    if (await element.isVisible()) {
      await expect(element).toHaveScreenshot(name, {
        animations: 'disabled',
        threshold: 0.2,
      });
    }
  }

  /**
   * Capture HTML snapshot with cleaned DOM
   */
  static async takeHtmlSnapshot(
    page: Page,
    selector: string,
    name: string
  ): Promise<void> {
    await this.cleanDynamicAttributes(page);
    const element = page.locator(selector);

    if (await element.isVisible()) {
      const content = await element.innerHTML();
      expect(content).toMatchSnapshot(name);
    }
  }

  /**
   * Capture multiple viewport sizes
   */
  static async captureResponsiveSnapshots(
    page: Page,
    name: string
  ): Promise<void> {
    const viewports = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.waitForLoadState('networkidle');
      await this.takeFullPageScreenshot(page, `${name}-${viewport.name}.png`);
    }
  }

  /**
   * Wait for all images to load before taking snapshot
   */
  static async waitForImages(page: Page): Promise<void> {
    await page.evaluate(() => {
      const images = Array.from(document.images);
      return Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve, reject) => {
            img.addEventListener('load', resolve);
            img.addEventListener('error', reject);
          });
        })
      );
    });
  }

  /**
   * Capture component states (hover, focus, etc.)
   */
  static async captureComponentStates(
    page: Page,
    selector: string,
    baseName: string
  ): Promise<void> {
    const element = page.locator(selector);

    if (await element.isVisible()) {
      // Default state
      await this.takeComponentScreenshot(
        page,
        selector,
        `${baseName}-default.png`
      );

      // Hover state
      await element.hover();
      await this.takeComponentScreenshot(
        page,
        selector,
        `${baseName}-hover.png`
      );

      // Focus state (if focusable)
      try {
        await element.focus();
        await this.takeComponentScreenshot(
          page,
          selector,
          `${baseName}-focus.png`
        );
      } catch {
        // Element might not be focusable, skip
      }

      // Reset to default state
      await page.mouse.move(0, 0);
    }
  }

  /**
   * Generate snapshots for common UI components
   */
  static async captureUIComponents(page: Page): Promise<void> {
    const components = [
      { selector: 'button, .btn, .button', name: 'buttons' },
      { selector: 'input, .input, .form-control', name: 'inputs' },
      { selector: '.card, .box', name: 'cards' },
      { selector: 'nav, .nav, .navbar', name: 'navigation' },
      { selector: 'form', name: 'forms' },
      { selector: 'table', name: 'tables' },
      { selector: '.modal, .dialog', name: 'modals' },
    ];

    for (const component of components) {
      const elements = page.locator(component.selector);
      const count = await elements.count();

      for (let i = 0; i < Math.min(count, 3); i++) {
        const element = elements.nth(i);
        if (await element.isVisible()) {
          const suffix = count > 1 ? `-${i + 1}` : '';
          await this.captureComponentStates(
            page,
            `${component.selector}:nth-child(${i + 1})`,
            `${component.name}${suffix}`
          );
        }
      }
    }
  }
}
