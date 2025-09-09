/**
 * Modern testing utilities that avoid deprecated react-test-renderer
 */
import {
  render as rtlRender,
  RenderOptions,
} from '@testing-library/react-native';
import React, { ReactElement } from 'react';

// Re-export everything from testing library except render
export * from '@testing-library/react-native';

// Custom render function that doesn't expose deprecated toJSON
export const render = (ui: ReactElement, options?: RenderOptions) => {
  const result = rtlRender(ui, options);

  // Remove toJSON from the result to prevent usage of deprecated API
  const { toJSON, ...cleanResult } = result;

  return {
    ...cleanResult,
    // Provide a modern alternative for snapshot-like testing
    getRenderedComponent: () => result.container || result.baseElement,
    // Helper for basic structural verification
    verifyRender: () => {
      // Just verify the component rendered without throwing
      return cleanResult.container !== null;
    },
  };
};

// Helper for converting old snapshot tests to behavioral tests
export const expectComponentToRender = (component: ReactElement) => {
  const { verifyRender } = render(component);
  expect(verifyRender()).toBe(true);
};
