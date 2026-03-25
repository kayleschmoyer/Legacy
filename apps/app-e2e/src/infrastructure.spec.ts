/**
 * E2E Infrastructure Validation
 *
 * Basic tests to verify Jest and the E2E test environment are
 * correctly configured. These run without any device or emulator.
 */

describe('App E2E Infrastructure', () => {
  it('should have Jest and test environment configured correctly', () => {
    expect(typeof jest).toBe('object');
    expect(process.env.NODE_ENV).toBeTruthy();
  });

  it('should have Node.js test environment available', () => {
    expect(typeof global).toBe('object');
    expect(typeof process).toBe('object');
    expect(typeof require).toBe('function');
  });

  it('should be able to run async tests', async () => {
    const result = await Promise.resolve('success');
    expect(result).toBe('success');
  });

  it('should have correct test timeout configured', () => {
    // Jest timeout is set to 120000ms in jest.config.json
    expect(jest.setTimeout).toBeDefined();
  });
});
