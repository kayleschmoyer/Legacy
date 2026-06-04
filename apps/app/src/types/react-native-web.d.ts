// React Native Web passes DOM event handlers through to the underlying DOM
// element at runtime, but the core RN TypeScript types don't include them
// because they're only meaningful in a web context.
//
// Augmenting ViewProps (the base of all RN component props) here means
// onKeyDown and tabIndex are accepted on Pressable, View, TouchableOpacity,
// etc. without needing per-component wrappers or type assertions.
//
// Use the useKeyboardActivation hook (common/hooks/useKeyboardActivation.ts)
// to apply these props — it returns the correct handler on web and an empty
// object on native so there's no runtime cost.
import 'react-native';

declare module 'react-native' {
  interface ViewProps {
    onKeyDown?: (e: React.KeyboardEvent<Element>) => void;
    onKeyUp?: (e: React.KeyboardEvent<Element>) => void;
    tabIndex?: number;
  }
}
