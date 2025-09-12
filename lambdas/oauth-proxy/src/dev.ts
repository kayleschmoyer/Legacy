import express from 'express';
import cors from 'cors';

import { LOGGER } from '@legacy-sports/logging';
import { proxyLambdaToExpress } from '@legacy-sports/utils';
import { handleGoogleAuth, handleGoogleRefresh } from './handlers/Google';
import { handleLogin, handleRegister } from './handlers/Local';

const PORT = 5001;

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.post('/local/register', (req, res) => {
  proxyLambdaToExpress(req, res, handleRegister);
});

app.post('/local/login', (req, res) => {
  proxyLambdaToExpress(req, res, handleLogin);
});

app.post('/google/auth', (req, res) => {
  proxyLambdaToExpress(req, res, handleGoogleAuth);
});

app.post('/google/refresh', (req, res) => {
  proxyLambdaToExpress(req, res, handleGoogleRefresh);
});

app.listen(PORT);
LOGGER.info(`Listening on port ${PORT}`);
