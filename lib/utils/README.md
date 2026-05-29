# utils

General-purpose utility functions shared across the entire monorepo — date formatting, string helpers, type guards, position-eligibility data, scoring math, etc. A Tier 1 dependency.

## Import model

This package exposes **exactly two entry points**:

| Entry point                 | Source         | Use from                                                                                   |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| `@legacy-sports/utils`      | `src/index.ts` | Anywhere — web, React Native (Metro), Node (Lambda/CLI), tests                             |
| `@legacy-sports/utils/node` | `src/node.ts`  | Node-only contexts (Lambda, CLI, scripts). **Never** import from web or React Native code. |

Everything safe for all runtimes — `ALLOWED_POSITIONS`, `HELP_FAQ_ITEMS`, `shuffleArray`, `formatDraftDate`, scoring math, error helpers — is re-exported from the root barrel. Import from the root.

```ts
// Correct
import {
  ALLOWED_POSITIONS_BY_SPORT,
  type SportKind,
} from '@legacy-sports/utils';
import { HELP_FAQ_ITEMS } from '@legacy-sports/utils';

// Correct — Node-only API surface (DbCredentials, LambdaHelpers, version, etc.)
import { getDbOptions } from '@legacy-sports/utils/node';

// Wrong — no other subpaths exist
import { ALLOWED_POSITIONS } from '@legacy-sports/utils/positions';
import { HELP_FAQ_ITEMS } from '@legacy-sports/utils/help-content';
```

### Why only two entry points?

Metro (the React Native bundler that ships `apps/app`) does **not** read `tsconfig.json` `paths`. It resolves modules via pure node-style lookup against `package.json`. Adding a one-off subpath mapping in `tsconfig.base.json` makes TypeScript and esbuild (Lambda) happy but breaks the Android/iOS build — the symbol is reachable from web and Lambda but not mobile, and the failure only surfaces at `Build Android App` in CI.

The fix is structural: keep the public API surface flat. The root barrel re-exports every browser-safe module; `/node` exists solely to keep Node-only side-effects (`pg`, `fs`, AWS SDK clients) out of the Metro bundle.

If you find yourself wanting a new subpath:

1. **Default: add it to the root barrel.** `export * from './lib/<new-module>'` in `src/index.ts`.
2. **Only if the module imports Node-only APIs**, add it to `src/node.ts` instead.
3. Do **not** add new `tsconfig.base.json` `paths` entries for individual files — they will desync from Metro and break the Android build.
