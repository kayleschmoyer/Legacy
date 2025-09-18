import { tamaguiConfig } from './tamagui-config';

describe('tamaguiConfig', () => {
  it('should be defined and have required properties', () => {
    expect(tamaguiConfig).toBeDefined();
    expect(tamaguiConfig).toHaveProperty('themes');
    expect(tamaguiConfig).toHaveProperty('tokens');
  });
});
