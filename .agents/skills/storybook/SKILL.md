---
name: storybook
description: 'Add or run Storybook stories for shared-components; covers story file conventions, naming, Meta/StoryObj patterns, TamaguiProvider decorator, interaction tests, accessibility, Nx targets, and how to run/build storybook locally. Load this skill before adding new stories or running storybook.'
---

# Skill: Storybook for Shared Components

## Overview

The `shared-components` library ships its own Storybook hosted at port **6009**. Stories are used for:

- Visual development of components in isolation
- Automated accessibility audits (`@storybook/addon-a11y`)
- Interaction tests via `play()` functions
- Documentation via `autodocs`

## Key Locations

| Path                                              | Purpose                                                     |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `lib/shared-components/.storybook/main.ts`        | Storybook configuration (glob pattern, addons, Vite config) |
| `lib/shared-components/.storybook/preview.ts`     | Global decorators (TamaguiProvider) and parameters          |
| `lib/shared-components/.storybook/test-runner.ts` | Playwright-based test runner config                         |
| `lib/shared-components/src/**/*.stories.tsx`      | Story files â€” auto-discovered via glob                    |

## Running Storybook

```powershell
# From the workspace root (recommended)
pnpm run storybook

# Or from the library directory
cd lib/shared-components
pnpm run storybook          # dev server on http://localhost:6009
pnpm run build-storybook    # static build â†’ dist/storybook/

# Via Nx
pnpm exec nx run shared-components:storybook
pnpm exec nx run shared-components:build-storybook
```

## Writing a Story

### 1. File placement

Place stories **co-located** with the component:

```
src/
  components/
    MyButton.tsx
    MyButton.stories.tsx   â† same directory
  features/
    draft/
      PlayerCard.tsx
      PlayerCard.stories.tsx
```

Files matching `src/**/*.stories.{ts,tsx,mdx}` are **auto-discovered** â€” no need to add them to `main.ts`.

### 2. Required imports

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test'; // only when testing callbacks
import { expect, userEvent, within } from '@storybook/test'; // only for play()
import { MyComponent } from './MyComponent';
```

### 3. `Meta` object (required)

```tsx
const meta: Meta<typeof MyComponent> = {
  // Category/ComponentName â€” drives sidebar grouping
  // Standard categories: Layout, Components, Features/Draft, Features/Players,
  //   Features/Stats, Features/Teams, Navigation, Introduction
  title: 'Components/MyButton',

  component: MyComponent,

  parameters: {
    layout: 'centered', // 'centered' | 'fullscreen' | 'padded'
    docs: {
      description: {
        component: 'One-sentence description shown in autodocs.',
      },
    },
  },

  // Always include 'autodocs' so Storybook generates an API reference page.
  // Add 'test' to include the story in the Playwright test-runner sweep.
  // Use 'skip-test' or 'broken' to exclude from test runs while keeping the story visible.
  tags: ['autodocs'],

  argTypes: {
    onPress: { action: 'pressed' }, // logs calls in the Actions panel
    variant: {
      control: 'select',
      options: ['default', 'outlined', 'ghost'],
      description: 'Visual variant',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;
```

### 4. Basic story variants

```tsx
export const Default: Story = {
  args: {
    children: 'Click me',
  },
};

export const Disabled: Story = {
  args: {
    children: 'Disabled',
    disabled: true,
  },
};
```

### 5. Interaction test (play function)

Add a `play` function when you want to assert that the component responds correctly to user events. These run automatically inside the Storybook UI and via the CLI test-runner.

```tsx
export const ClickTest: Story = {
  args: {
    children: 'Submit',
    onPress: fn(),
  },
  tags: ['test'], // include in CI test-runner sweep
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: /Submit/i });

    await expect(button).toBeInTheDocument();
    await userEvent.click(button);
    await expect(args.onPress).toHaveBeenCalledOnce();
  },
};
```

### 6. Accessibility overrides (a11y)

Color contrast is globally disabled because Tamagui resolves colors via CSS custom properties that axe-core cannot evaluate at test time. To re-enable or add per-story rules:

```tsx
export const HighContrast: Story = {
  parameters: {
    a11y: {
      config: {
        rules: [{ id: 'color-contrast', enabled: true }],
      },
    },
  },
  // ...
};

// To skip a11y entirely on one story:
export const Known: Story = {
  parameters: { a11y: { disable: true } },
  // ...
};
```

## Tamagui Provider

All stories are **automatically wrapped** by `TamaguiProvider` with the `dark` theme via the global decorator in `preview.ts`. You do not need to add it manually.

If a story requires the `light` theme, add a decorator locally:

```tsx
import { TamaguiProvider, Theme } from 'tamagui';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';
import React from 'react';
import type { Decorator } from '@storybook/react';

const withLight: Decorator = (Story) =>
  React.createElement(
    TamaguiProvider,
    { config: tamaguiConfig, defaultTheme: 'light' },
    React.createElement(Theme, { name: 'light' }, React.createElement(Story)),
  );

export const LightVariant: Story = {
  decorators: [withLight],
  args: {
    /* ... */
  },
};
```

## Nx Targets

`project.json` exposes three storybook-related Nx targets:

| Target            | Command                                              | What it does                       |
| ----------------- | ---------------------------------------------------- | ---------------------------------- |
| `storybook`       | `pnpm exec nx run shared-components:storybook`       | Dev server on port 6009            |
| `build-storybook` | `pnpm exec nx run shared-components:build-storybook` | Static build â†’ `dist/storybook/` |
| `test:stories`    | `pnpm exec nx run shared-components:test:stories`    | Jest-based story unit tests        |

## Title Naming Convention

Use the following hierarchy for `title:`:

| Category              | Example title                                  |
| --------------------- | ---------------------------------------------- |
| Top-level intro       | `Introduction/Welcome`                         |
| Theme / design tokens | `Introduction/ThemeGallery`                    |
| Layout primitives     | `Layout/Card`, `Layout/XStack`                 |
| Generic UI            | `Components/Button`, `Components/LoadingPanel` |
| Draft feature         | `Features/Draft/PlayerCard`                    |
| Players feature       | `Features/Players/PlayerRow`                   |
| Stats feature         | `Features/Stats/StatsTable`                    |
| Teams feature         | `Features/Teams/TeamPicker`                    |
| Navigation            | `Navigation/AppNavigator`                      |

## Complete Minimal Example

```tsx
// src/components/Badge.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
    docs: {
      description: { component: 'Status badge with color variants.' },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['info', 'success', 'warning', 'error'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = { args: { variant: 'info', label: 'Info' } };
export const Success: Story = { args: { variant: 'success', label: 'Live' } };
export const Warning: Story = { args: { variant: 'warning', label: 'Injury' } };
export const Error: Story = { args: { variant: 'error', label: 'Out' } };
```

## Checklist When Adding a Story

- [ ] File is co-located with the component (`Component.stories.tsx`)
- [ ] `title` follows the `Category/ComponentName` hierarchy
- [ ] `tags: ['autodocs']` present on `meta`
- [ ] At least one variant story exported (default state)
- [ ] `argTypes` documents each prop with a control and description
- [ ] `a11y` not suppressed unless there's a documented reason
- [ ] No `@ts-ignore` or `eslint-disable` in story files
