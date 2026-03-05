export function utils(): string {
  return 'utils';
}

/**
 * Canonical Fisher-Yates shuffle — returns a new shuffled array.
 *
 * This is the single source of truth for array shuffling in the codebase.
 * All other copies have been removed in favour of this implementation.
 * If the algorithm needs to change (e.g. to use crypto.getRandomValues for
 * fairness), update ONLY this function.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
