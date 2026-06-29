import type { SportKind } from '@legacy-sports/utils';
import { MLB_TEAMS } from './mlb';
import { NFL_TEAMS as NFL_TEAMS_MAP, type NflTeam } from '../nflTeams';

export * from './mlb';
export * from './nfl';

export type TeamFilterOption = {
  readonly value: string;
  readonly label: string;
};

const NFL_CONFERENCE_ORDER: Record<string, number> = { AFC: 0, NFC: 1 };
const NFL_DIVISION_ORDER: Record<string, number> = {
  East: 0,
  North: 1,
  South: 2,
  West: 3,
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
      .sort((a, b) => {
        const cDiff =
          (NFL_CONFERENCE_ORDER[a.conference] ?? 99) -
          (NFL_CONFERENCE_ORDER[b.conference] ?? 99);
        if (cDiff !== 0) return cDiff;
        const dDiff =
          (NFL_DIVISION_ORDER[a.division] ?? 99) -
          (NFL_DIVISION_ORDER[b.division] ?? 99);
        if (dDiff !== 0) return dDiff;
        return a.city.localeCompare(b.city);
      })
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
