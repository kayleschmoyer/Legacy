import express from 'express';
import cors from 'cors';
import { LOGGER } from '@legacy-sports/logging';
import { proxySqsToExpress } from '@legacy-sports/utils/node';
import { handler as createMatchupHandler } from './handlers/create-matchup';
import { handler as selectGameHandler } from './handlers/select-game';

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
