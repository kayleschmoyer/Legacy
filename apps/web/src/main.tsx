import { StrictMode } from 'react';
import { HashRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';

// Initialize React Native Web
import 'react-native-web/dist/cjs/exports/AppRegistry';

import { AppProvider } from './components/AppProvider';
import { apolloClient } from './lib/apollo-client';
import App from './app/app';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <StrictMode>
    <HashRouter>
      <AppProvider apolloClient={apolloClient} colorScheme="dark">
        <App />
      </AppProvider>
    </HashRouter>
  </StrictMode>
);
