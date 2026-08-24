export { BrandLogo } from './BrandLogo';
export type { BrandLogoProps } from './BrandLogo';
// Only re-export the names stable across both the web (`AnimatedLaunchScreen.tsx`)
// and native (`AnimatedLaunchScreen.native.tsx`, LS-9746) forks — Metro/Jest
// resolve this bare specifier per-platform at runtime, so a name that exists
// on only one side would come back `undefined` on the other. Platform-specific
// timing constants (e.g. web's `LAUNCH_REVEAL_MS`/`LAUNCH_HOLD_MS`, native's
// `LAUNCH_DRAW_MS`/`LAUNCH_PUNCH_MS`/`LAUNCH_STAMP_MS`) are exported directly
// from their own file instead.
export {
  AnimatedLaunchScreen,
  LAUNCH_FADE_OUT_MS,
  LAUNCH_TOTAL_MS,
} from './AnimatedLaunchScreen';
export type { AnimatedLaunchScreenProps } from './AnimatedLaunchScreen';
export { BrandedSplash } from './BrandedSplash';
export type { BrandedSplashProps } from './BrandedSplash';
export { BrandHero } from './BrandHero';
export type { BrandHeroProps } from './BrandHero';
