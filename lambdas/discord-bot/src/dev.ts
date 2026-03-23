import express from 'express';
import { LOGGER } from '@legacy-sports/logging';
import { proxyLambdaToExpress } from '@legacy-sports/utils/node';
import { baseHandler } from './index';

const PORT = 5011;

const app = express();

app.get('/', (_req, res) => {
  res.send('Discord Bot Dev Server');
});

// Use raw body to preserve Discord signature verification
app.post('/discord-bot', express.raw({ type: '*/*' }), (req, res) => {
  proxyLambdaToExpress(req, res, baseHandler);
});

app.use(express.json());

app.get('/discord-bot/health', (req, res) => {
  proxyLambdaToExpress(req, res, baseHandler);
});

app.listen(PORT);
LOGGER.info(`Discord Bot listening on port ${PORT}`);
