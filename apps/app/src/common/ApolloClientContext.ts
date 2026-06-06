import * as React from 'react';
import { DbClient } from './auth/DbClient';

const client = new DbClient();
export const DbClientContext = React.createContext(client);

export async function clearApolloCache(): Promise<void> {
  await client.apolloClient.clearStore();
}
