// Typography helpers shared by the Home dashboard variants (web uses the
// Heritage web fonts; native falls back to the system face). Extracted from
// `HomeScreen.tsx` under LS-8794 so the compact mobile layout uses the exact
// same faces rather than a second copy of the `isWeb` ternary.

import { isWeb } from 'tamagui';

/** Big Shoulders Display on web; system default on native. */
export const DISPLAY_FONT = isWeb
  ? 'Big Shoulders Display, system-ui, sans-serif'
  : undefined;

/** Literata on web; system default on native. */
export const BODY_FONT = isWeb ? 'Literata, Georgia, serif' : undefined;
