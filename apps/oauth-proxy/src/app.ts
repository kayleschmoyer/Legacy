import * as cors from 'cors';
import { OAuth2Client, UserRefreshClient } from 'google-auth-library';
import * as express from 'express';
import * as cookieParser from 'cookie-parser';
import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { getUserJwt } from './Users';
import fetch from 'cross-fetch';

const REFRESH_TOKEN_COOKIE = 'GOOGLE_REFRESH_TOKEN';

interface ResponseType {
  google_token: string;
  internal_token: string;
}

export function createApplication(
  clientId: string,
  clientSecret: string,
  jwtSecretKey: string,
  cookieSecret: string,
  graphqlHost: string,
): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser(cookieSecret));

  app.use((req, res, next) => {
    console.log({ req, res });
    next();
  });

  const oAuth2Client = new OAuth2Client(clientId, clientSecret, 'postmessage');
  const apolloClient = new ApolloClient({
    link: new HttpLink({ uri: graphqlHost, fetch }),
    cache: new InMemoryCache(),
  });

  app.post('/auth/google', async (req, res: express.Response<ResponseType>) => {
    const { tokens } = await oAuth2Client.getToken(req.body.code);

    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refresh_token, {
      maxAge: 1000 * 60 * 60,
      signed: true,
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
    });

    if (tokens.id_token === null || tokens.id_token === undefined) {
      throw new Error('Invalid token returned from google!');
    }

    const userJwt = await getUserJwt(
      apolloClient,
      tokens.id_token,
      jwtSecretKey,
    );

    res.json({
      google_token: tokens.id_token,
      internal_token: userJwt,
    });
  });

  app.post(
    '/auth/google/refresh-token',
    async (req, res: express.Response<ResponseType>) => {
      const refreshToken = req.signedCookies[REFRESH_TOKEN_COOKIE];

      const user = new UserRefreshClient(clientId, clientSecret, refreshToken);
      const { credentials } = await user.refreshAccessToken(); // obtain new tokens

      if (credentials.id_token === null || credentials.id_token === undefined) {
        throw new Error('Invalid token returned from google!');
      }

      const userJwt = await getUserJwt(
        apolloClient,
        credentials.id_token,
        jwtSecretKey,
      );

      res.json({
        google_token: credentials.id_token,
        internal_token: userJwt,
      });
    },
  );

  return app;
}
