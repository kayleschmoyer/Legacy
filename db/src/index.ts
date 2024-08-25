import { proxy, createServer } from 'aws-serverless-express';
import postgraphile from 'postgraphile';
import { options } from './postgraphileOptions';
import { combineMiddlewares } from './combineMiddlewares';
import cors from 'cors';
import { NextFunction, Request, Response } from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { APIGatewayEvent, Context } from 'aws-lambda';

const schemas = process.env.DATABASE_SCHEMAS
  ? process.env.DATABASE_SCHEMAS.split(',')
  : ['app_public'];

const app = combineMiddlewares([
  /*
   * Note that any middlewares you add here *must* call `next`.
   *
   * This is typically useful for augmenting the request before it goes to PostGraphile.
   */

  // CORS middleware to permit cross-site API requests. Configure to taste
  cors(),

  // Determines the effective URL we are at if `absoluteRoutes` is set
  (req: Request, res: Response, next: NextFunction) => {
    if (options.absoluteRoutes) {
      try {
        let gatewayEventHeader = req.headers['x-apigateway-event'] || '';

        if (Array.isArray(gatewayEventHeader)) {
          gatewayEventHeader = gatewayEventHeader.join(':');
        }

        const event = JSON.parse(decodeURIComponent(gatewayEventHeader));
        // This contains the `stage`, making it a true absolute URL (which we
        // need for serving assets)
        const realPath = event.requestContext.path;
        req.originalUrl = realPath;
      } catch (e) {
        return next(new Error('Processing event failed'));
      }
    }
    next();
  },
  postgraphile(process.env.DATABASE_URL, schemas, {
    ...options,
    readCache: `${__dirname}/postgraphile.cache`,
  }),
]);

const requestHandler = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>
) => {
  app(req as Request, res as Response, (err) => {
    if (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      if (!res.headersSent) {
        res.statusCode = err.status || err.statusCode || 500;
        res.setHeader('Content-Type', 'application/json');
      }
      res.end(JSON.stringify({ errors: [{ message: err.message }] }));
      return;
    }
    if (!res.finished) {
      if (!res.headersSent) {
        res.statusCode = 404;
      }
      res.end(`'${req.url}' not found`);
    }
  });
};

const binaryMimeTypes = options.graphiql ? ['image/x-icon'] : undefined;
const server = createServer(requestHandler, undefined, binaryMimeTypes);
export const handler = (event: APIGatewayEvent, context: Context) =>
  proxy(server, event, context);
