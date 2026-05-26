import { disableFragmentWarnings } from 'graphql-tag';

import 'expo-router/entry';

if (process.env.NODE_ENV !== 'production') {
  disableFragmentWarnings();
}
