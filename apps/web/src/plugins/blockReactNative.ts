import type { Plugin } from 'vite';

/**
 * Vite plugin to block React Native imports in web builds
 */
export function blockReactNativePlugin(): Plugin {
  return {
    name: 'block-react-native',
    enforce: 'pre',
    resolveId(id, importer) {
      // Block any React Native internal libraries
      if (id.includes('react-native/Libraries/')) {
        console.warn(`🚫 Blocked React Native Library: ${id} from ${importer}`);
        // Return a dummy module path instead of the React Native one
        return 'data:text/javascript,export default {};';
      }

      // Block specific problematic React Native modules
      const blockedModules = [
        'react-native/Libraries/NativeComponent/ViewConfigIgnore',
        'react-native/Libraries/Components/TextInput/RCTTextInputViewConfig',
        'react-native/Libraries/Components/TextInput/RCTSingelineTextInputNativeComponent',
        'react-native/Libraries/Utilities/Platform',
        'react-native/Libraries/EventEmitter',
        'react-native/Libraries/Animated/nodes',
      ];

      if (blockedModules.some((module) => id.includes(module))) {
        console.warn(`� Blocked specific RN module: ${id} from ${importer}`);
        return 'data:text/javascript,export default {};';
      }

      // Log other React Native imports for debugging
      if (
        id.includes('react-native') &&
        !id.includes('react-native-web') &&
        !id.includes('react-native-svg-web') &&
        !importer?.includes('react-native-web')
      ) {
        console.warn(`� React Native import detected: ${id} from ${importer}`);
      }

      // Don't interfere with other imports
      return null;
    },
  };
}
