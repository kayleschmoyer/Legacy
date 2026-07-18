import React from 'react';
import { render, screen } from '@testing-library/react';
import { PlayerStatsPage } from './PlayerStatsPage';
import { Platform } from '../../platform-components';
import { MockedProvider } from '../../test-utils/MockedProvider';

// LS-8440 regression: navigating Home → Player Statistics crashed the native
// app because the shared PlayerStatsPage passed web-only CSS (multi-value
// padding/margin strings, `background`/`border` shorthands, `transform`
// strings, `em` units) as inline `style` on Tamagui/RN nodes. crossPlatformStyle
// (`csp`) now neutralizes those on native. This mounts the full page under the
// mobile jest project (Platform.OS === 'ios') and asserts it renders instead of
// throwing. The exact style transform is verified in crossPlatformStyle.spec.ts.

function renderPage(props: React.ComponentProps<typeof PlayerStatsPage> = {}) {
  return render(
    <MockedProvider mocks={[]}>
      <PlayerStatsPage {...props} />
    </MockedProvider>,
  );
}

// This spec runs under both the web and mobile jest projects, but the crash it
// guards is native-only and the full page only mounts under the mobile jest
// harness's RN mocks. Scope the suite to native so it exercises the fixed code
// path (Platform.OS === 'ios') without fighting the web harness. The exact
// style transform is verified cross-platform in crossPlatformStyle.spec.ts.
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('PlayerStatsPage native render (LS-8440)', () => {
  it('runs under the native jest project (Platform.OS === "ios")', () => {
    expect(Platform.OS).toBe('ios');
  });

  it('renders the stats page without crashing', () => {
    expect(() => renderPage()).not.toThrow();
    // Header copy proves the render tree mounted past the web-only style props.
    expect(screen.getAllByText('Player Statistics').length).toBeGreaterThan(0);
  });

  // Premium and non-premium differ only by the app-side PremiumGate wrapper and
  // the column-preset props (statsFormat / isPremiumPageSize); the shared page
  // must render under both without crashing.
  it.each([
    { statsFormat: 'standard' as const, isPremiumPageSize: false },
    { statsFormat: 'expanded' as const, isPremiumPageSize: true },
  ])('renders for %o', (variant) => {
    expect(() => renderPage(variant)).not.toThrow();
  });
});
