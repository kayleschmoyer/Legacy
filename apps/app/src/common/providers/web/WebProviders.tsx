import { GoogleOAuthProvider } from '@react-oauth/google';
import { PropsWithChildren } from 'react';
import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import { EnvironmentVariable } from '../../EnvironmentVariables';

export function WebProviders({
  children,
}: PropsWithChildren): React.JSX.Element {
  return (
    <GoogleOAuthProvider
      clientId={getEnvVarRequired(EnvironmentVariable.GOOGLE_OAUTH_CLIENT_ID)}
    >
      {children}
    </GoogleOAuthProvider>
  );
}
