import axios from 'axios';

const MAX_REQUESTS_PER_MINUTE = 10;

let lastRequest: number;

export async function getFromBaseballReference(
  url: string,
): Promise<string> {
  if (lastRequest) {
    const delta = Date.now() - lastRequest; // 6000

    const sleepLength = (60 * 1000) / MAX_REQUESTS_PER_MINUTE - delta;
    if (sleepLength > 0) {
      console.log(`Sleeping ${sleepLength}`);
      await new Promise((res) => setTimeout(res, sleepLength));
    }
  }

  lastRequest = Date.now();

  const response = await axios.get<string>(url);
  return response.data;
}

export function getPlayers(letter: string): Promise<string>{
  return getFromBaseballReference(
    `https://www.baseball-reference.com/players/${letter}/`,
  );
}

export  function getCareerStats(brefId: string): Promise<string>{
return getFromBaseballReference(
  `https://www.baseball-reference.com/players/${brefId[0]}/${brefId}.shtml`,
);
}