import express from 'express';
import cors from 'cors';
import { LOGGER } from '@legacy-sports/logging';
import { proxyLambdaToExpress } from '@legacy-sports/utils/node';
import { baseHandler } from './index';

const PORT = 5003;

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.send('Jira Proxy Dev Server');
});

app.post('/jira/bug', (req, res) => {
  proxyLambdaToExpress(req, res, baseHandler);
});

app.get('/jira/health', (req, res) => {
  proxyLambdaToExpress(req, res, baseHandler);
});

app.listen(PORT);
LOGGER.info(`Jira Proxy listening on port ${PORT}`);
