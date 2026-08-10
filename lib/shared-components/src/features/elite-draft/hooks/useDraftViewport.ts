import { useMedia } from 'tamagui';

/**
 * True below the `$sm` breakpoint (≤640px) — the same threshold
 * PreDraftLobby.tsx already uses for its narrow-viewport chrome. Bound
 * through an explicit signature (rather than calling useMedia() directly)
 * so EliteDraftBoardScreen.spec.tsx can mock this hook in isolation instead
 * of reaching into Tamagui's internals, and so the call stays type-safe
 * under this project's typed ESLint rules. Optional-chained because this
 * file's spec runs under both the web and mobile Jest projects, and the
 * mobile Tamagui mock doesn't stub useMedia — real Tamagui on web always
 * provides it.
 */
export function useIsCompactDraftViewport(): boolean {
  const readMedia = useMedia as (() => { sm?: boolean }) | undefined;
  return Boolean(readMedia?.().sm);
}
