import { isClientRejection } from './httpErrors';

describe('isClientRejection', () => {
  it('returns true for 4xx statuses', () => {
    expect(isClientRejection(400)).toBe(true);
    expect(isClientRejection(401)).toBe(true);
    expect(isClientRejection(404)).toBe(true);
    expect(isClientRejection(499)).toBe(true);
  });

  it('returns false for non-4xx statuses', () => {
    expect(isClientRejection(200)).toBe(false);
    expect(isClientRejection(399)).toBe(false);
    expect(isClientRejection(500)).toBe(false);
    expect(isClientRejection(503)).toBe(false);
  });

  it('returns false when status is undefined', () => {
    expect(isClientRejection(undefined)).toBe(false);
  });
});
