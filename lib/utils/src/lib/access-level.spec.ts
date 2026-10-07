import { getAccessLevelLabel } from './access-level';

describe('getAccessLevelLabel', () => {
  it('labels admins Administrator', () => {
    expect(getAccessLevelLabel('admin')).toBe('Administrator');
  });

  it("labels the non-admin 'none' role Member, never Limited (LS-10650)", () => {
    expect(getAccessLevelLabel('none')).toBe('Member');
  });

  it('labels a missing access level Member', () => {
    expect(getAccessLevelLabel(undefined)).toBe('Member');
    expect(getAccessLevelLabel(null)).toBe('Member');
  });
});
