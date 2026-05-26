import htmlParser from 'node-html-parser';
import { LOGGER } from '@legacy-sports/logging';
import { getPlayerPage, getPlayersList } from './PFRSession';
import type { IdpPosition, PfrPlayerInfo, PfrPlayerSummary } from './types';

const PFR_ID_REGEX = /\/players\/[A-Z]\/([A-Za-z0-9]+)\.htm$/;

// Maps PFR raw position strings to our internal IDP position values.
const POSITION_MAP: Record<string, IdpPosition> = {
  DE: 'DL',
  DT: 'DL',
  ILB: 'LB',
  OLB: 'LB',
  MLB: 'LB',
  LB: 'LB',
  CB: 'DB',
  S: 'DB',
  FS: 'DB',
  SS: 'DB',
  DB: 'DB',
  QB: 'QB',
  RB: 'RB',
  FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K: 'K',
  P: null,
  LS: null,
  OL: null,
  T: null,
  G: null,
  C: null,
};

export function mapPfrPosition(rawPosition: string): IdpPosition {
  const upper = rawPosition.trim().toUpperCase();
  if (upper in POSITION_MAP) {
    return POSITION_MAP[upper] ?? null;
  }
  return null;
}

export async function getPlayersByLetter(
  letter: string,
): Promise<PfrPlayerSummary[]> {
  const html = await getPlayersList(letter);
  const root = htmlParser(html);

  // PFR player list uses #div_players_ (same structure as Baseball Reference)
  const listDiv = root.getElementById('div_players_');

  const result: PfrPlayerSummary[] = [];

  if (listDiv === null) {
    LOGGER.warn(`No player list div found for letter ${letter}`);
    return result;
  }

  for (const el of listDiv.getElementsByTagName('p')) {
    const anchor = el.getElementsByTagName('a')[0];

    if (!anchor) {
      continue;
    }

    const href = anchor.getAttribute('href') ?? '';
    const match = href.match(PFR_ID_REGEX);

    if (!match) {
      LOGGER.debug(`Could not parse pfrId from href: ${href}`);
      continue;
    }

    const pfrId = match[1];
    const name = anchor.text.trim();

    // Position and team info follows the anchor as text, e.g.: "QB (2000-2015)"
    // PFR also shows the position as a <em> tag or plain text after the link.
    const elText = el.text.trim();
    const afterName = elText.slice(name.length).trim();

    // Extract raw position — appears as the first token, e.g. "QB (2000-2015)"
    const positionMatch = afterName.match(/^([A-Z/]+)/);
    const rawPosition = positionMatch ? positionMatch[1] : '';

    // Last team abbreviation may appear in a separate span or attribute.
    // PFR encodes team in the entry text as "(with TEAM)" or similar.
    // Fall back to null if not parseable — callers can fetch getPlayerInfo if needed.
    const teamMatch = afterName.match(/\(([A-Z]{2,3})\)\s*$/);
    const lastTeam = teamMatch ? teamMatch[1] : null;

    result.push({ pfrId, name, rawPosition, lastTeam });
  }

  LOGGER.debug(
    `Parsed ${result.length} players for letter ${letter.toUpperCase()}`,
  );

  return result;
}

export async function getPlayerInfo(pfrId: string): Promise<PfrPlayerInfo> {
  const html = await getPlayerPage(pfrId);
  const root = htmlParser(html);

  // Player name is in <h1 itemprop="name">
  const nameEl = root.querySelector('[itemprop="name"]');
  const name = nameEl?.text.trim() ?? '';

  // Bio section: <div id="meta">
  const metaDiv = root.getElementById('meta');

  let rawPosition = '';
  let currentTeam: string | null = null;
  let dateOfBirth: string | null = null;

  if (metaDiv) {
    // Position is typically in a <p> containing "Position:" text
    for (const p of metaDiv.getElementsByTagName('p')) {
      const text = p.text;

      if (text.includes('Position')) {
        const posMatch = text.match(/Position[:\s]+([A-Z/]+)/);
        if (posMatch) rawPosition = posMatch[1];
      }

      if (text.includes('Team')) {
        // Team abbreviation may appear as a link or text
        const teamAnchor = p.getElementsByTagName('a')[0];
        if (teamAnchor) {
          // href like /teams/kan/2024.htm → 'KAN'
          const teamHref = teamAnchor.getAttribute('href') ?? '';
          const teamMatch = teamHref.match(/\/teams\/([a-z]{2,3})\//);
          if (teamMatch) currentTeam = teamMatch[1].toUpperCase();
        }
      }

      if (text.includes('Born')) {
        const dobEl = p.querySelector('[itemprop="birthDate"]');
        if (dobEl) {
          dateOfBirth = dobEl.getAttribute('data-birth') ?? null;
        }
      }
    }
  }

  return { pfrId, name, rawPosition, currentTeam, dateOfBirth };
}
