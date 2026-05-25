# Feature Flags

Legacy Sports uses [GrowthBook](https://www.growthbook.io/) for runtime feature flags and A/B tests.

## Flag Reference

### `football_enabled`

| Property                  | Value                                                        |
| ------------------------- | ------------------------------------------------------------ |
| **Type**                  | Boolean                                                      |
| **Default (production)**  | `false` (until launch)                                       |
| **Default (dev/staging)** | `false`                                                      |
| **Ticket**                | [LS-4767](https://legacysports.atlassian.net/browse/LS-4767) |

Controls whether football-specific user-facing surfaces are visible. Flip to `true` at launch to enable football for all users without a redeploy.

**Gated surfaces (flag `false` → hidden/blocked):**

- **Web**: `/football` and all `/football/*` routes redirect to `/`
- **Web**: Football option hidden in the league creation sport switcher
- **Web**: Football entry hidden in the top-nav Sports dropdown
- **Mobile**: Football entry hidden in the drawer navigation

**Not gated** (intentionally always-on): API resolvers, database tables, background jobs. These are additive and safe to enable independently.

**Runtime behavior:** The flag is polled by the GrowthBook SDK (`autoRefresh: true`). UI updates propagate within GrowthBook's default poll cadence (~60 s) without a rebuild or redeploy.

## SDK Setup

### Web (`apps/web`)

Provider: `apps/web/src/context/GrowthBookProvider.tsx`

```tsx
import { useFeatureIsOn } from '../context/GrowthBookProvider';

const footballEnabled = useFeatureIsOn('football_enabled');
```

Client key: `VITE_GROWTHBOOK_CLIENT_KEY` env var.

### Mobile (`apps/app`)

Provider added to the root layout (`apps/app/src/app/_layout.tsx`).

```tsx
import { useFeatureIsOn } from '@growthbook/growthbook-react';

const footballEnabled = useFeatureIsOn('football_enabled');
```

Client key: `EXPO_PUBLIC_GROWTHBOOK_CLIENT_KEY` env var (mirrored from `VITE_GROWTHBOOK_CLIENT_KEY` at build time via `app.config.js`).
