import express from 'express';
import cors from 'cors';
import { LOGGER } from '@legacy-sports/logging';
import { proxySqsToExpress } from '@legacy-sports/utils';
import { handler as createMatchupHandler } from './handlers/create-matchup';
import { handler as selectGameHandler } from './handlers/select-game';
import {
  handler as populateGameHandler,
  PopulateGameStatsEvent,
} from './handlers/populate-game-stats';

const PORT = 5003;

const app = express();

app.use(cors());
app.use(express.json());

app.post('/select-game', (req, res) => {
  proxySqsToExpress(req, res, selectGameHandler);
});

app.post('/create-matchup', (req, res) => {
  proxySqsToExpress(req, res, createMatchupHandler);
});

app.listen(PORT);
LOGGER.info(`Listening on port ${PORT}`);

async function run(): Promise<void> {
  await populateGameHandler({} as PopulateGameStatsEvent);
}

run().catch((err) => LOGGER.error(err));
