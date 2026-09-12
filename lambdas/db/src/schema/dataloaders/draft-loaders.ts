/**
 * Draft DataLoaders
 */

import DataLoader from 'dataloader';
import type { GenericDatabase, PublicSchema } from '@legacy-sports/db-client';

import { loadDraftedPlayerAdp } from '../drafts/draft-adp';

/**
 * Consensus rank (stack-rank ADP) for players already drafted, keyed
 * `"<draftId>:<playerId>"`.
 *
 * Batched by draft rather than by player: the rank is a window function over
 * the league's whole draftable pool, so it costs the same to compute for one
 * pick as for every pick in the draft. A live board asks for all ~200 picks at
 * once, and this collapses that into one query per draft.
 *
 * Resolves to `null` for a player the pool has no score for. That null is
 * load-bearing all the way to the UI — real historical ADP isn't collected
 * yet, so it is the common case, not an edge case — and it must stay null
 * rather than becoming a 0 or a guess: the board renders an em dash for it and
 * leaves the pick out of its team's net-value total (LS-10096).
 */
export const createDraftedPlayerAdpLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<string, number | null>(async (keys) => {
    const draftIds = [
      ...new Set(keys.map((key) => Number(key.split(':')[0]))),
    ].filter((id) => Number.isFinite(id));

    const byDraft = new Map<number, Map<number, number>>();
    await Promise.all(
      draftIds.map(async (draftId) => {
        byDraft.set(draftId, await loadDraftedPlayerAdp(db, draftId));
      }),
    );

    return keys.map((key) => {
      const [draftId, playerId] = key.split(':').map(Number);
      return byDraft.get(draftId)?.get(playerId) ?? null;
    });
  });
