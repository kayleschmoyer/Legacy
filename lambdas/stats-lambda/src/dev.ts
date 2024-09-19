import express from 'express';
import cors from 'cors';

import { LOGGER } from '@legacy-sports/logging';
import { proxySqsToExpress } from '@legacy-sports/utils';
import { handler } from './load-career';

const PORT = 5002;

const app = express();

app.use(cors());
app.use(express.json());

app.post('/load-career-stats', (req, res) => {
  proxySqsToExpress(req, res, handler);
});

app.listen(PORT);
LOGGER.info(`Listening on port ${PORT}`);
