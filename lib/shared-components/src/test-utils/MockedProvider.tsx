import React from 'react';
import type { MockedProviderProps } from '@apollo/client/testing/react';
import { MockedProvider as ApolloMockedProvider } from '@apollo/client/testing/react';
import { InMemoryCache } from '@apollo/client';

/**
 * Custom MockedProvider that creates a cache without deprecated options
 * to avoid deprecation warnings in tests
 */
export function MockedProvider({
  children,
  cache,
  ...props
}: MockedProviderProps) {
  // Create a clean cache without deprecated options if none is provided
  const cleanCache =
    cache ||
    new InMemoryCache({
      // Only include current, non-deprecated options
      typePolicies: {},
    });

  return (
    <ApolloMockedProvider cache={cleanCache} {...props}>
      {children}
    </ApolloMockedProvider>
  );
}
