import { useGetPlayerIdByBrefIdQuery } from '@legacy-sports/graphql';

/**
 * Resolve the display name for a game-logs deep link's bref id (e.g.
 * `fosteru01` → `Rube Foster`), for {@link GameLogsTable}'s `playerName` prop
 * (LS-10661).
 *
 * Returns `undefined` when there is no bref id — the table keeps its editable
 * Player ID input — and an empty string while the lookup is in flight or finds
 * no name, so the raw id is never shown to end users on a deep link.
 */
export function useGameLogsPlayerName(
  brefId: string | null | undefined,
): string | undefined {
  const trimmed = brefId?.trim() ?? '';
  const { data } = useGetPlayerIdByBrefIdQuery({
    variables: { brefId: trimmed.toLowerCase() },
    skip: !trimmed,
  });
  if (!trimmed) return undefined;
  const player = data?.playerByBrefId;
  return [player?.firstName, player?.lastName].filter(Boolean).join(' ');
}
