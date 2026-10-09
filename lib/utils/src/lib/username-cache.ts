/**
 * Purge denormalized copies of a user's username from the Apollo cache after
 * a successful username change (LS-7242 / PRS-041).
 *
 * `User.username` is refreshed by the mutation response itself, but
 * `LeagueMember.username` is a separate normalized entity that keeps the old
 * name until it is refetched. Evicting just that field makes every
 * league-member surface refetch the new name instead of showing the stale one.
 *
 * Takes a structural cache type so `lib/utils` stays free of an Apollo dependency.
 */

interface EvictableCache {
  extract(): unknown;
  evict(options: { id: string; fieldName: string }): boolean;
  gc(): string[];
}

export function evictStaleUsernames(
  cache: EvictableCache,
  userId: number,
): void {
  const entities = (cache.extract() ?? {}) as Record<string, unknown>;
  for (const [cacheId, entity] of Object.entries(entities)) {
    if (!cacheId.startsWith('LeagueMember:')) continue;
    if ((entity as { userId?: unknown } | null)?.userId !== userId) continue;
    cache.evict({ id: cacheId, fieldName: 'username' });
  }
  cache.gc();
}
