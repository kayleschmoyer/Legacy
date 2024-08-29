import { GoogleOAuthProvider } from '@react-oauth/google';
import { PropsWithChildren } from 'react';
import {
  EnvironmentVariable,
  getEnvVarRequired,
} from '../../EnvironmentVariables';

export function WebProviders({ children }: PropsWithChildren): JSX.Element {
  return (
    <GoogleOAuthProvider
      clientId={getEnvVarRequired(EnvironmentVariable.GOOGLE_OAUTH_CLIENT_ID)}
    >
      {children}
    </GoogleOAuthProvider>
  );
}
