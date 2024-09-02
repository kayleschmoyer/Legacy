import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';

import { createGraphiQLFetcher } from '@graphiql/toolkit';
import { explorerPlugin } from '@graphiql/plugin-explorer';
import { GraphiQL } from 'graphiql';
import 'graphiql/graphiql.css';
import '@graphiql/plugin-explorer/dist/style.css';
import './main.css';


const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

// Can't do this dynamically because webpack doesn't bind dynamic vars
const GRAPHQL_HOST = process.env.GRAPHQL_HOST || '';

const fetcher = createGraphiQLFetcher({
  url: GRAPHQL_HOST,
});
// Pass the explorer props here if you want
const plugins = [explorerPlugin()];

root.render(
  <StrictMode>
    <GraphiQL fetcher={fetcher} plugins={plugins} />
  </StrictMode>,
);
