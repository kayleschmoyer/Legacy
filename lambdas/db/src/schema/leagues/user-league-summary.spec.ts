/**
 * Unit tests for the `UserLeagueSummary` derivation helpers (LS-4943).
 *
 * The dashboard summary resolver exposes a new `isCommissioner` boolean derived
 * from the viewer's league_members permission level. These tests pin the
 * derivation contract without requiring a live Postgres connection.
 */
import { deriveIsCommissioner } from './queries';

describe('deriveIsCommissioner', () => {
  it('is true only for the commissioner role', () => {
    expect(deriveIsCommissioner('commissioner')).toBe(true);
  });

  it('is false for non-commissioner roles', () => {
    expect(deriveIsCommissioner('general_manager')).toBe(false);
    expect(deriveIsCommissioner('assistant_manager')).toBe(false);
  });

  it('is false for null/undefined/unknown permission levels', () => {
    expect(deriveIsCommissioner(null)).toBe(false);
    expect(deriveIsCommissioner(undefined)).toBe(false);
    expect(deriveIsCommissioner('owner')).toBe(false);
  });
});
