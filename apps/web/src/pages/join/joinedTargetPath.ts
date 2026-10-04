import type { JoinedTarget } from '@legacy-sports/shared-components/draft';

/** The route a joined (or already-joined) mock draft or league lives at (LS-10078). */
export function joinedTargetPath(target: JoinedTarget): string {
  return target.kind === 'mock'
    ? `/${target.sport}/mock-draft/${String(target.draftId)}`
    : `/${target.sport}/league/${String(target.leagueId)}`;
}
