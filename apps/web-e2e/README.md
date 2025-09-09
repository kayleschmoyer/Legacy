# Web E2E Tests

This project contains end-to-end tests for the web application using Playwright and MSW (Mock Service Worker) for API mocking.

## Overview

The `web-e2e` project is a dedicated Nx project for testing the web application with:

- **Playwright**: Cross-browser testing framework
- **MSW**: Mock Service Worker for intercepting and mocking API calls
- **Multi-browser support**: Chrome, Firefox, Safari, and mobile viewports

## Project Structure

```
apps/web-e2e/
├── src/
│   ├── mocks/           # MSW mock handlers
│   │   ├── handlers.ts  # API mock definitions
│   │   ├── server.ts    # Node.js MSW server
│   │   └── browser.ts   # Browser MSW worker
│   ├── support/         # Test setup and utilities
│   │   ├── global-setup.ts
│   │   ├── global-teardown.ts
│   │   ├── test-setup.ts
│   │   └── snapshot-utils.ts    # Snapshot testing utilities
│   └── tests/           # Actual test files
│       ├── app.spec.ts           # Main application tests
│       ├── visual-snapshots.spec.ts  # Visual regression tests
│       ├── html-snapshots.spec.ts    # HTML structure snapshots
│       └── sports-app-snapshots.spec.ts  # Sports-specific snapshots
├── test-results/        # Generated snapshot files
├── playwright-report/   # Test reports
├── playwright.config.ts # Playwright configuration
├── project.json        # Nx project configuration
└── tsconfig.*.json     # TypeScript configurations
```

## Available Commands

### Run E2E Tests

```bash
# Run all tests
npx nx e2e web-e2e

# Run tests in headed mode (visible browser)
npx nx e2e web-e2e --headed

# Run tests in UI mode (interactive)
npx nx e2e web-e2e --ui

# Run tests in debug mode
npx nx e2e web-e2e --debug

# List all available tests
npx nx e2e web-e2e --list

# Run only snapshot tests
npx nx e2e:snapshots web-e2e

# Update all snapshots
npx nx e2e:update-snapshots web-e2e
```

### Linting

```bash
# Run linting
npx nx lint web-e2e

# Run linting with auto-fix
npx nx lint web-e2e --fix
```

## Snapshot Testing

This project includes comprehensive snapshot testing capabilities:

### Visual Snapshots

- **Full page screenshots** across multiple browsers and viewports
- **Component-level screenshots** with interaction states (hover, focus)
- **Responsive design testing** (mobile, tablet, desktop)
- **Theme variation testing** (light/dark modes)
- **Loading and error state capture**

### HTML Snapshots

- **DOM structure snapshots** for regression testing
- **Component markup validation**
- **API response structure snapshots**
- **Accessibility tree snapshots**
- **Page metadata snapshots**

### Snapshot Utilities

The `SnapshotUtils` class provides helper methods:

```typescript
// Full page screenshot with consistent settings
await SnapshotUtils.takeFullPageScreenshot(page, 'homepage.png');

// Component screenshot with state variations
await SnapshotUtils.captureComponentStates(page, '.button', 'primary-button');

// Responsive snapshots across viewports
await SnapshotUtils.captureResponsiveSnapshots(page, 'landing-page');

// HTML structure snapshot
await SnapshotUtils.takeHtmlSnapshot(page, 'main', 'main-content.html');
```

### Managing Snapshots

```bash
# Generate initial snapshots (first run)
npx nx e2e:update-snapshots web-e2e

# Run only snapshot tests
npx nx e2e:snapshots web-e2e

# Update snapshots after UI changes
npx nx e2e:update-snapshots web-e2e

# View snapshot differences in report
npx nx e2e web-e2e
# Then open: npx playwright show-report
```

### Snapshot Configuration

Snapshots are configured with:

- **Threshold**: 0.2 (20%) pixel difference tolerance
- **Animation handling**: Disabled for consistency
- **Dynamic content**: Hidden (timestamps, loading states)
- **Cross-browser**: Separate snapshots per browser

## Test Configuration

### Browsers

The tests run against multiple browsers:

- Desktop Chrome
- Desktop Firefox
- Desktop Safari
- Mobile Chrome (Pixel 5)
- Mobile Safari (iPhone 12)

### Base URL

Tests are configured to run against `http://localhost:4200` (the web app dev server).

### MSW Mocking

All external API calls are intercepted and mocked using MSW:

- GraphQL queries (user data, sports data, etc.)
- REST API endpoints (authentication, games, etc.)
- No real external requests are made during testing

## Writing Tests

### Basic Test Structure

```typescript
import { expect, test } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/');
    // Your test code here
  });
});
```

### Adding Snapshot Tests

```typescript
import { expect, test } from '@playwright/test';
import { SnapshotUtils } from '../support/snapshot-utils';

test('should match visual snapshot', async ({ page }) => {
  await page.goto('/');
  await SnapshotUtils.takeFullPageScreenshot(page, 'feature-page.png');
});
```

```typescript
// For GraphQL
http.post('/graphql', async ({ request }) => {
  const body = await request.json();
  const { query } = body as { query: string };

  if (query.includes('yourQuery')) {
    return HttpResponse.json({
      data: { /* your mock data */ }
    });
  }
}),

// For REST APIs
http.get('/api/your-endpoint', () => {
  return HttpResponse.json({
    // your mock response
  });
}),
```

## Dependencies

This project depends on:

- `@playwright/test`: E2E testing framework
- `msw`: API mocking
- The `web` application (implicit dependency)

## CI/CD Integration

The project includes a `ci` configuration that outputs JUnit reports for CI systems:

```bash
npx nx e2e web-e2e --configuration=ci
```
