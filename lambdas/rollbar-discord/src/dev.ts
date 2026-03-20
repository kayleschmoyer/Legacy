import express from 'express';
import { LOGGER } from '@legacy-sports/logging';
import { proxyLambdaToExpress } from '@legacy-sports/utils/node';
import { handleApiGatewayEvent } from './index';

const PORT = 5010;

const app = express();

app.get('/', (_req, res) => {
  res.send('Rollbar Discord Dev Server');
});

// Webhook route uses raw body to preserve HMAC signature verification
app.post(
  '/rollbar-discord/webhook',
  express.raw({ type: '*/*' }),
  (req, res) => {
    proxyLambdaToExpress(req, res, handleApiGatewayEvent);
  },
);

// All other routes use JSON parsing
app.use(express.json());

app.get('/rollbar-discord/health', (req, res) => {
  proxyLambdaToExpress(req, res, handleApiGatewayEvent);
});

app.listen(PORT);
LOGGER.info(`Rollbar Discord listening on port ${PORT}`);
