/**
 * NFL franchise reference data (LS-7477, LS-7478).
 *
 * Mirrors the shape of the MLB franchise table so the GameLogsTable opponent
 * filter can share a single rendering/filter path. Derives the canonical
 * team list from the existing `NFL_TEAMS` map in ../nflTeams.ts — that file
 * is the source of truth for display data; this one layers franchise-id
 * mapping + historical abbreviations on top so relocations resolve.
 *
 * Notable historical mappings:
 *   LV  ← OAK (Raiders, relocated 2020)
 *   LAC ← SD  (Chargers, relocated 2017)
 *   LAR ← STL (Rams, relocated 2016)
 *   TEN ← HOU_OILERS (Oilers→Titans, 1997)
 *   WAS ← WSH / WFT (Washington name changes)
 */

import { NFL_TEAMS as NFL_TEAMS_MAP, type NflTeam } from '../nflTeams';

export interface NflFranchise {
  franchiseId: string;
  currentAbbr: string;
  currentName: string;
  historicalAbbrs: string[];
  conference: 'AFC' | 'NFC';
  division: 'North' | 'South' | 'East' | 'West';
}

const HISTORICAL_OVERRIDES: Record<string, string[]> = {
  LV: ['OAK'],
  LAC: ['SD'],
  LAR: ['STL'],
  TEN: ['HOU_OILERS'],
  WAS: ['WSH', 'WFT'],
};

function toFranchise(team: NflTeam): NflFranchise {
  return {
    franchiseId: team.abbreviation,
    currentAbbr: team.abbreviation,
    currentName: team.fullName,
    historicalAbbrs: HISTORICAL_OVERRIDES[team.abbreviation] ?? [],
    conference: team.conference,
    division: team.division,
  };
}

export const NFL_FRANCHISES: ReadonlyArray<NflFranchise> = Object.values(
  NFL_TEAMS_MAP,
)
  .filter((t): t is NflTeam => Boolean(t))
  .map(toFranchise);

export function franchiseIdForNflAbbr(abbr: string): string | undefined {
  const up = abbr.toUpperCase();
  for (const t of NFL_FRANCHISES) {
    if (t.currentAbbr === up) return t.franchiseId;
    if (t.historicalAbbrs.includes(up)) return t.franchiseId;
  }
  return undefined;
}

export function expandNflFranchiseAbbrs(franchiseIdOrAbbr: string): string[] {
  const id =
    franchiseIdForNflAbbr(franchiseIdOrAbbr) ?? franchiseIdOrAbbr.toUpperCase();
  const team = NFL_FRANCHISES.find((t) => t.franchiseId === id);
  if (!team) return [franchiseIdOrAbbr.toUpperCase()];
  return [team.currentAbbr, ...team.historicalAbbrs];
}
