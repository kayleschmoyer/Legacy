/**
 * Empty-state copy for the available-player list (LS-10593).
 *
 * The server filters the list to positions that still fill one of the
 * viewer's open roster slots (LS-8065). The old copy — "All available players
 * have been drafted" — was simply wrong whenever the list was only hiding
 * positions the user had already filled, so every empty state now names the
 * filter (and the banner's "Show all" toggle lifts it).
 */
export const OPEN_SLOTS_EMPTY_MESSAGE =
  'No players fit your open roster spots — tap “Show all” to see every position';

export const OPEN_SLOTS_EMPTY_SEARCH_MESSAGE =
  'No players match your search in your open roster spots';
