// Mock tamagui dependencies that have react-native-web issues in Jest
jest.mock('@tamagui/config', () => ({
  config: {
    themes: {},
    tokens: {},
    media: {},
    shorthands: {},
    settings: {},
  },
}));

jest.mock('tamagui', () => ({
  createTamagui: jest.fn(
    (config: unknown) => config as Record<string, unknown>,
  ),
}));

import { tamaguiConfig } from './tamagui-config';

describe('tamaguiConfig', () => {
  it('should be defined and have required properties', () => {
    expect(tamaguiConfig).toBeDefined();
    expect(tamaguiConfig).toHaveProperty('themes');
    expect(tamaguiConfig).toHaveProperty('tokens');
  });
});
