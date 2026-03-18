import express from 'express';
import type {
  APIGatewayEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';

import { LOGGER } from '@legacy-sports/logging';
import { handler } from './index';

const PORT = 5001;

const app = express();

app.use(express.json());

// Simulate API Gateway: forward all requests to the real Lambda handler so that
// local Docker dev matches production routing exactly (paths like /oauth/login,
// /oauth/google, /oauth/verify, etc.).
app.all('*', (req, res) => {
  const event: APIGatewayEvent = {
    httpMethod: req.method,
    path: req.path,
    headers: req.headers as Record<string, string>,
    multiValueHeaders: {},
    body:
      req.body && Object.keys(req.body as object).length > 0
        ? JSON.stringify(req.body)
        : null,
    queryStringParameters: (req.query as Record<string, string>) || null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayEvent['requestContext'],
    resource: req.path,
    isBase64Encoded: false,
  };

  void Promise.resolve(handler(event, {} as Context))
    .then((response: APIGatewayProxyResult) => {
      if (response.headers) {
        for (const [key, value] of Object.entries(response.headers)) {
          res.setHeader(key, value.toString());
        }
      }
      res.status(response.statusCode).send(response.body);
    })
    .catch((err: unknown) => {
      LOGGER.error(String(err));
      res.status(500).send();
    });
});

app.listen(PORT);
LOGGER.info(`Listening on port ${PORT}`);
