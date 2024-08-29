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

const fetcher = createGraphiQLFetcher({
  url: 'https://gc63i18mdi.execute-api.us-east-1.amazonaws.com/dev/graphql',
});
// Pass the explorer props here if you want
const plugins = [explorerPlugin()];

root.render(
  <StrictMode>
    <GraphiQL fetcher={fetcher} plugins={plugins} />
  </StrictMode>,
);
