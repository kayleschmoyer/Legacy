import {
  cleanDescription,
  extractPlayerNameFromDescription,
  stripDiacritics,
} from './mobile';

/**
 * Metro resolves '@legacy-sports/utils' to mobile.ts via the package
 * "react-native" field. OnThisDayFeed (shared-components) imports these three
 * string helpers from the package root; when they were missing from this
 * barrel they resolved to `undefined` on Android and the widget crashed the
 * Home screen with "undefined is not a function" (LS-7953). These assertions
 * guard the mobile entry point so the helpers stay reachable on Hermes.
 */
describe('mobile entry point (LS-7953)', () => {
  it('re-exports cleanDescription as a callable function', () => {
    expect(typeof cleanDescription).toBe('function');
    expect(cleanDescription('Signed by the Red Sox, and.')).toBe(
      'Signed by the Red Sox.',
    );
  });

  it('re-exports extractPlayerNameFromDescription as a callable function', () => {
    expect(typeof extractPlayerNameFromDescription).toBe('function');
    expect(
      extractPlayerNameFromDescription(
        'Yankees signed free agent RHP Gerrit Cole.',
      ),
    ).toBe('Gerrit Cole');
  });

  it('re-exports stripDiacritics as a callable function', () => {
    expect(typeof stripDiacritics).toBe('function');
    expect(stripDiacritics('José Ramírez')).toBe('Jose Ramirez');
  });
});
