import { getDefaultEnableAnimations } from './defaultEnableAnimations';

describe('getDefaultEnableAnimations', () => {
  // `window.matchMedia` is a writable jest mock installed by test-setup.ts;
  // spying on it lets mockRestore() put the original back after each test.
  let matchMediaSpy: jest.SpyInstance;

  beforeEach(() => {
    matchMediaSpy = jest.spyOn(window, 'matchMedia');
  });

  afterEach(() => {
    matchMediaSpy.mockRestore();
  });

  it('defaults to OFF when the OS requests reduced motion', () => {
    matchMediaSpy.mockReturnValue({ matches: true });
    expect(getDefaultEnableAnimations()).toBe(false);
    expect(matchMediaSpy).toHaveBeenCalledWith(
      '(prefers-reduced-motion: reduce)',
    );
  });

  it('defaults to ON when the OS has no reduced-motion preference', () => {
    matchMediaSpy.mockReturnValue({ matches: false });
    expect(getDefaultEnableAnimations()).toBe(true);
  });

  it('defaults to ON when matchMedia is unavailable', () => {
    Reflect.set(window, 'matchMedia', undefined);
    expect(getDefaultEnableAnimations()).toBe(true);
  });
});
