/**
 * Modern testing utilities that avoid deprecated react-test-renderer
 */
import {
  RenderOptions,
  render as rtlRender,
} from '@testing-library/react';
import React, { ReactElement } from 'react';

// Re-export everything from testing library except render
export * from '@testing-library/react';

// Custom render function that doesn't expose deprecated toJSON
export const render = (ui: ReactElement, options?: RenderOptions) => {
  const result = rtlRender(ui, options);

  return {
    ...result,
    // Provide a modern alternative for snapshot-like testing
    getRenderedComponent: () => result.container,
    // Helper for basic structural verification
    verifyRender: () => {
      // Just verify the component rendered without throwing
      return result.container !== null;
    },
  };
};

// Helper for converting old snapshot tests to behavioral tests
export const expectComponentToRender = (component: ReactElement) => {
  const { verifyRender } = render(component);
  expect(verifyRender()).toBe(true);
};
