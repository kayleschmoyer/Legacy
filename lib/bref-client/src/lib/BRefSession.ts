import axios from 'axios';
import { LOGGER } from '@legacy-sports/logging';

const MAX_REQUESTS_PER_MINUTE = 10;

let lastRequest: number;

export async function getFromBaseballReference(url: string): Promise<string> {
  if (lastRequest) {
    const delta = Date.now() - lastRequest; // 6000

    const sleepLength = (60 * 1000) / MAX_REQUESTS_PER_MINUTE - delta;
    if (sleepLength > 0) {
      LOGGER.debug(`Sleeping ${sleepLength}`);
      await new Promise((res) => setTimeout(res, sleepLength));
    }
  }

  lastRequest = Date.now();

  const response = await axios.get<string>(url);
  return response.data;
}

export function getPlayers(letter: string): Promise<string> {
  return getFromBaseballReference(
    `https://www.baseball-reference.com/players/${letter}/`
  );
}

export function getCareerStats(brefId: string): Promise<string> {
  return getFromBaseballReference(
    `https://www.baseball-reference.com/players/${brefId[0]}/${brefId}.shtml`
  );
}

export function getGameStats(
  brefId: string,
  statType: 'b' | 'p' | 'f',
  season: number
): Promise<string> {
  return getFromBaseballReference(
    `https://www.baseball-reference.com/players/gl.fcgi?id=${brefId}&t=${statType}&year=${season}`
  );
}
