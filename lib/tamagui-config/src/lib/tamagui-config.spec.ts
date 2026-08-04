// Mock tamagui dependencies that have react-native-web issues in Jest
jest.mock('@tamagui/config', () => ({
  config: {
    themes: {},
    tokens: {},
    media: {},
    shorthands: {},
    settings: {},
  },
  createGenericFont: jest.fn(
    (family: string, font: Record<string, unknown> = {}) => ({
      family,
      ...font,
    }),
  ),
}));

jest.mock('tamagui', () => ({
  createTamagui: jest.fn(
    (config: unknown) => config as Record<string, unknown>,
  ),
}));

import { foundationTokens, tamaguiConfig } from './tamagui-config';

describe('tamaguiConfig', () => {
  it('should be defined and have required properties', () => {
    expect(tamaguiConfig).toBeDefined();
    expect(tamaguiConfig).toHaveProperty('themes');
    expect(tamaguiConfig).toHaveProperty('tokens');
  });
});

describe('foundationTokens', () => {
  it('re-exports the design-tokens foundation categories without duplicating values', () => {
    expect(foundationTokens.spacing[4]).toBe(16);
    expect(foundationTokens.radii[4]).toBe(12);
    expect(foundationTokens.typeScale.xl).toBe(22);
    expect(foundationTokens.leading.body).toBe(1.55);
    expect(foundationTokens.shadowsDark.gold).toContain('rgba(197, 165, 90');
    expect(foundationTokens.shadowsLight.sm).toContain('rgba(2, 6, 23');
  });
});
