import {
  ApolloClient,
  ApolloQueryResult,
  FetchResult,
  NormalizedCacheObject,
} from '@apollo/client';
import {
  CreateUser,
  GetUserByEmail,
  UserFragment,
} from './api/db/graphql.generated';
import { sign } from 'jsonwebtoken';
import { jwtDecode } from 'jwt-decode';
import { LOGGER } from '@legacy-sports/logging';

export interface LegacySportsJwt {
  id: number;
  email: string | null | undefined;
  username: string;
  isAdmin: boolean;
  about: string | null | undefined;
}

export interface GoogleJwtContents {
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
  given_name: string;
  family_name: string;
  iss: string;
}

export async function getUserJwt(
  client: ApolloClient<NormalizedCacheObject>,
  googleToken: string,
  jwtKey: string,
): Promise<string> {
  const googleJwt = jwtDecode<GoogleJwtContents>(googleToken);
  let user = await getUserByEmail(client, googleJwt.email);

  // No user exists, let's create one
  if (user === null) {
    user = await createUser(client, googleJwt);
  }

  if (!user) {
    throw new Error('Failed to create JWT for user!');
  }

  const jwt: LegacySportsJwt = {
    id: user.id,
    isAdmin: user.isAdmin,
    about: user.about,
    username: user.username,
    email: user.email,
  };

  return sign(jwt, jwtKey);
}

function checkForErrorQuery<T>(result: ApolloQueryResult<T>): T {
  if (result.error) {
    throw result.error;
  }

  if (result.data == null) {
    throw new Error('No data returned from query.');
  }

  return result.data;
}

function checkForErrorMutation<T>(result: FetchResult<T>): T {
  if (result.errors) {
    throw new Error(
      `Error in apollo mutation: ${JSON.stringify(result.errors)}`,
    );
  }

  if (result.data == null) {
    throw new Error('No data returned from mutation.');
  }

  return result.data;
}

async function createUser(
  client: ApolloClient<NormalizedCacheObject>,
  jwt: GoogleJwtContents,
): Promise<UserFragment | undefined | null> {
  try {
    const response = await client.mutate({
      mutation: CreateUser,
      variables: {
        input: {
          user: {
            about: 'Created from Google JWT',
            email: jwt.email,
            name: jwt.name,
            username: jwt.email,
          },
        },
      },
    });

    return checkForErrorMutation(response).createUser?.user;
  } catch (err) {
    LOGGER.error('Failed to create user');
    throw err;
  }
}

async function getUserByEmail(
  client: ApolloClient<NormalizedCacheObject>,
  email: string,
): Promise<UserFragment | undefined | null> {
  const response = await client.query({
    query: GetUserByEmail,
    variables: {
      email: email,
    },
  });

  return checkForErrorQuery(response).userByEmail;
}
