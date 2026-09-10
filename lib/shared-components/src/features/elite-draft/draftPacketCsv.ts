import type { DraftPickRecord } from './types';

/**
 * Builds the full league draft packet as CSV — every pick, every team, in
 * draft order — for the premium "download draft packet" feature (LS-9750).
 * Pure/platform-agnostic so both web (Blob download) and mobile (native
 * share sheet) can reuse the same string.
 */
export function buildDraftPacketCsv(
  pickHistory: readonly DraftPickRecord[],
  teamNameById: (teamId: number | null | undefined) => string,
): string {
  const header = ['Round', 'Pick', 'Overall', 'Team', 'Player'];
  const rows = [...pickHistory]
    .sort((a, b) => a.overallPick - b.overallPick)
    .map((pick) => [
      String(pick.round),
      String(pick.pickNumber),
      String(pick.overallPick),
      teamNameById(pick.teamId),
      pick.player ? `${pick.player.firstName} ${pick.player.lastName}` : '—',
    ]);
  return [header, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n');
}

function escapeCsvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function draftPacketFilename(
  leagueName: string | null | undefined,
): string {
  const safe = (leagueName ?? 'league')
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-');
  return `${safe}-draft-packet.csv`;
}
