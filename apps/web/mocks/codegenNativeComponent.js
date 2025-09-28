// Mock for react-native/Libraries/Utilities/codegenNativeComponent
// This is used by React Native packages that try to access native codegen utilities

import React from 'react';

function codegenNativeComponent(name, options) {
  // For web, we just return a generic React component
  return React.forwardRef((props, ref) => {
    return React.createElement('div', { ...props, ref });
  });
}

export default codegenNativeComponent;
