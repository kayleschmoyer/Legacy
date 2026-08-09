import { renderHook } from '@testing-library/react';
import {
  colors,
  shadowsDark,
  shadowsLight,
} from '@legacy-sports/design-tokens';
import { useThemeTokens } from './useThemeTokens';

const mockUseThemeName = jest.fn();
jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
  useThemeName: (): unknown => mockUseThemeName(),
}));

describe('useThemeTokens', () => {
  it('resolves dark tokens when the active theme name contains "dark"', () => {
    mockUseThemeName.mockReturnValue('dark');
    const { result } = renderHook(() => useThemeTokens());

    expect(result.current.resolvedTheme).toBe('dark');
    expect(result.current.surface).toBe(colors.dark.surface);
    expect(result.current.text).toBe(colors.dark.text);
    expect(result.current.glass).toBe(colors.dark.glass);
    expect(result.current.shadows).toBe(shadowsDark);
  });

  it('resolves dark tokens for the "legacy_dark" theme name', () => {
    mockUseThemeName.mockReturnValue('legacy_dark');
    const { result } = renderHook(() => useThemeTokens());

    expect(result.current.resolvedTheme).toBe('dark');
    expect(result.current.shadows).toBe(shadowsDark);
  });

  it('resolves light tokens when the active theme name does not contain "dark"', () => {
    mockUseThemeName.mockReturnValue('light');
    const { result } = renderHook(() => useThemeTokens());

    expect(result.current.resolvedTheme).toBe('light');
    expect(result.current.surface).toBe(colors.light.surface);
    expect(result.current.text).toBe(colors.light.text);
    expect(result.current.glass).toBe(colors.light.glass);
    expect(result.current.shadows).toBe(shadowsLight);
  });

  it('always exposes theme-independent brand, positions, and semantic tokens', () => {
    mockUseThemeName.mockReturnValue('light');
    const { result } = renderHook(() => useThemeTokens());

    expect(result.current.brand).toBe(colors.brand);
    expect(result.current.positions).toBe(colors.positions);
    expect(result.current.semantic).toBe(colors.semantic);
  });
});
