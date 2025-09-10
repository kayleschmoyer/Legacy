import htmlParser from 'node-html-parser';
import { LOGGER } from '@legacy-sports/logging';
import { getPlayers as getPlayersFromBref } from './BRefSession';

const BREF_CODE_GROUP = 'brefId';
const BREF_URL_REGEX = new RegExp(
  `.*\\/(?<${BREF_CODE_GROUP}>[a-z'_\\.]+[0-9]+).shtml$`
);

export interface PlayerInfo {
  firstName: string;
  lastName: string;
  brefId: string;
}

export type Letter =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z';

export async function getPlayers(letter: Letter): Promise<PlayerInfo[]> {
  const html = await getPlayersFromBref(letter);
  const parser = htmlParser(html);

  const tableRoot = parser.getElementById('div_players_');

  const result: PlayerInfo[] = [];

  if (tableRoot === null) {
    return result;
  }

  for (const el of tableRoot.getElementsByTagName('p')) {
    const anchor = el.getElementsByTagName('a')[0];

    const match = anchor.getAttribute('href')?.match(BREF_URL_REGEX);

    const brefCode = match?.groups ? match.groups[BREF_CODE_GROUP] : null;

    if (brefCode === null) {
      LOGGER.error(`Could Not Match`);
      LOGGER.debug(
        JSON.stringify({
          href: anchor.getAttribute('href'),
          regex: BREF_URL_REGEX.toString(),
        })
      );
      throw new Error('Error');
    }

    // Split name into first and last name
    const fullName = anchor.text.trim();
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    result.push({
      brefId: brefCode,
      firstName,
      lastName,
    });
  }

  return result;
}
