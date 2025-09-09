// Mock for react-native/Libraries/Utilities/codegenNativeCommands
// This is used by React Native packages that try to access native command utilities

function codegenNativeCommands(options) {
  // For web, we return empty command functions
  return {};
}

export default codegenNativeCommands;
