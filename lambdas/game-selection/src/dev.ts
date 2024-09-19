import express from 'express';
import cors from 'cors';
import { LOGGER } from '@legacy-sports/logging';
import { proxySqsToExpress } from '@legacy-sports/utils';
import { handler } from './handlers/create-matchup';

const PORT = 5003;

const app = express();

app.use(cors());
app.use(express.json());

app.post('/create-matchup', (req, res) => {
  proxySqsToExpress(req, res, handler);
});

app.listen(PORT);
LOGGER.info(`Listening on port ${PORT}`);
