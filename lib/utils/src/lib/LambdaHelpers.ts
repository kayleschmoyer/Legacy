import express from 'express';
import {
  APIGatewayEvent,
  APIGatewayProxyResult,
  SQSBatchResponse,
  SQSEvent,
  SQSRecord,
} from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';

export type ApiGatewayHandler = (
  event: APIGatewayEvent
) => Promise<APIGatewayProxyResult>;

export function proxyLambdaToExpress(
  req: express.Request,
  res: express.Response,
  handler: ApiGatewayHandler
): void {
  const event: APIGatewayEvent = {
    body: JSON.stringify(req.body),
    headers: req.headers,
  } as APIGatewayEvent;

  LOGGER.debug(req);
  LOGGER.debug(event);

  handler(event)
    .then((response) => {
      if (response.headers) {
        for (const [key, value] of Object.entries(response.headers)) {
          res.setHeader(key, value.toString());
        }
      }

      res.status(response.statusCode);
      res.send(response.body);
    })
    .catch((err) => {
      LOGGER.error(err);
      res.status(500);
      res.send();
    });
}

type SqsHandler = (event: SQSEvent) => Promise<SQSBatchResponse>;

export function proxySqsToExpress(
  req: express.Request,
  res: express.Response,
  handler: SqsHandler
): void {
  const event: SQSEvent = {
    Records: [{ body: JSON.stringify(req.body) } as SQSRecord],
  };

  LOGGER.debug(req);
  LOGGER.debug(event);

  handler(event)
    .then(() => {
      res.status(200);
      res.send();
    })
    .catch((err) => {
      LOGGER.error(err);
      res.status(500);
      res.send();
    });
}
