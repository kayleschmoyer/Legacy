import express from 'express';
import cors from 'cors';

import { LOGGER } from '@legacy-sports/logging';
import { proxySqsToExpress } from '@legacy-sports/utils/node';
import { handler } from './load-career';
import {
  getPlayersForRefresh,
  getPlayersWithOldStats,
  getPlayersWithoutAnyStats,
  getRefreshSummary,
} from './stats-refresh-utils';

const PORT = 5002;

const app = express();

app.use(cors());
app.use(express.json());

app.post('/load-career-stats', (req, res) => {
  proxySqsToExpress(req, res, handler);
});

// Stats refresh utility endpoints
app.get('/refresh-summary', async (req, res) => {
  try {
    const summary = await getRefreshSummary();
    res.json(summary);
  } catch (error) {
    LOGGER.error('Error getting refresh summary:', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/players-needing-refresh', async (req, res) => {
  try {
    const maxAgeHours = req.query.maxAgeHours
      ? parseInt(req.query.maxAgeHours as string)
      : 24;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string)
      : undefined;

    const players = await getPlayersForRefresh(maxAgeHours, limit);
    res.json(players);
  } catch (error) {
    LOGGER.error('Error getting players needing refresh:', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/players-without-stats', async (req, res) => {
  try {
    const limit = req.query.limit
      ? parseInt(req.query.limit as string)
      : undefined;

    const players = await getPlayersWithoutAnyStats(limit);
    res.json(players);
  } catch (error) {
    LOGGER.error('Error getting players without stats:', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/players-with-old-stats', async (req, res) => {
  try {
    const beforeDateParam = req.query.beforeDate as string;
    if (!beforeDateParam) {
      return res
        .status(400)
        .json({ error: 'beforeDate query parameter is required' });
    }

    const beforeDate = new Date(beforeDateParam);
    if (isNaN(beforeDate.getTime())) {
      return res.status(400).json({ error: 'Invalid beforeDate format' });
    }

    const limit = req.query.limit
      ? parseInt(req.query.limit as string)
      : undefined;

    const players = await getPlayersWithOldStats(beforeDate, limit);
    res.json(players);
  } catch (error) {
    LOGGER.error('Error getting players with old stats:', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT);
LOGGER.info(`Listening on port ${PORT}`);
