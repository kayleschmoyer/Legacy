// Mock for react-native/Libraries/ReactNative/AppContainer
// This is used by React Native packages that try to access AppContainer

import React from 'react';

const AppContainer = React.forwardRef((props, ref) => {
  return React.createElement('div', { ...props, ref });
});

export default AppContainer;
