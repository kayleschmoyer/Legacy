import type { SportKind } from '@legacy-sports/utils';
import { MLB_TEAMS } from './mlb';
import { NFL_TEAMS as NFL_TEAMS_MAP, type NflTeam } from '../nflTeams';

export * from './mlb';
export * from './nfl';

export type TeamFilterOption = {
  readonly value: string;
  readonly label: string;
};

export const TEAM_FILTER_OPTIONS_BY_SPORT: Readonly<
  Record<SportKind, ReadonlyArray<TeamFilterOption>>
> = {
  football: [
    { value: 'All', label: 'All Teams' },
    { value: 'AFC', label: 'AFC' },
    { value: 'NFC', label: 'NFC' },
    ...Object.values(NFL_TEAMS_MAP)
      .filter((t): t is NflTeam => t != null)
      .map((t) => ({
        value: t.abbreviation,
        label: `${t.abbreviation} — ${t.fullName}`,
      })),
  ],
  baseball: [
    { value: 'All', label: 'All Teams' },
    { value: 'AL', label: 'AL' },
    { value: 'NL', label: 'NL' },
    ...MLB_TEAMS.map((t) => ({
      value: t.currentAbbr,
      label: `${t.currentAbbr} — ${t.currentName}`,
    })),
  ],
};
