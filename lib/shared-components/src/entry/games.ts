// Feature entry point: games
// Import from this entry point for the standalone minigame features (20
// Questions, the Minigames Hub, and the Progressive Disclosure game). Kept
// separate from `./sports` so pages that only need lightweight sport config
// (CUSTOM_ERA_MIN_YEAR_BY_SPORT, etc.) don't also pull in these self-contained
// game features.
// Usage: import { TwentyQuestionsGame } from '@legacy-sports/shared-components/games'
export * from '../features/twenty-questions';
export * from '../features/minigames-hub';
export * from '../features/disclosure-game';
