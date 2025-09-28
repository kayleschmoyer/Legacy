import React from 'react';
import { renderHook } from '@testing-library/react';
import { usePlayerStatsQuery } from './PlayerStatsApi';
import { MockedProvider } from '../../test-utils/MockedProvider';

describe('PlayerStatsApi', () => {
  describe('usePlayerStatsQuery', () => {
    it('should initialize without errors', () => {
      const { result } = renderHook(
        () => usePlayerStatsQuery({ first: 25 }, {}, []),
        {
          wrapper: ({ children }) => (
            <MockedProvider mocks={[]}>{children}</MockedProvider>
          ),
        },
      );

      // Basic smoke test - ensure the hook can be called without throwing
      expect(typeof result.current).toBe('object');
    });
  });
});
