import { clearCsrfToken, getCsrfToken, storeCsrfToken } from './csrf';

describe('csrf', () => {
  beforeEach(() => {
    localStorage.clear();
    clearCsrfToken();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getCsrfToken', () => {
    it('returns empty string when no token is stored', () => {
      expect(getCsrfToken()).toBe('');
    });

    it('returns token after storeCsrfToken', () => {
      storeCsrfToken('token-a');
      expect(getCsrfToken()).toBe('token-a');
    });

    it('returns latest localStorage value even when in-memory is stale', () => {
      // Simulate: storeCsrfToken sets in-memory to "token-a"
      storeCsrfToken('token-a');
      expect(getCsrfToken()).toBe('token-a');

      // Simulate: a different code path (e.g. AuthService) writes directly
      // to localStorage without updating this module's in-memory variable
      localStorage.setItem('ls_csrf_token', 'token-b');

      // getCsrfToken must return the latest localStorage value, not the
      // stale in-memory value. This is the fix for the concurrent refresh
      // race condition that caused CSRF 403 errors.
      expect(getCsrfToken()).toBe('token-b');
    });

    it('falls back to in-memory when localStorage is unavailable', () => {
      storeCsrfToken('token-memory');

      // Simulate localStorage becoming unavailable after store
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      expect(getCsrfToken()).toBe('token-memory');
      // spy restored by afterEach
    });
  });

  describe('storeCsrfToken', () => {
    it('persists to localStorage', () => {
      storeCsrfToken('persisted-token');
      expect(localStorage.getItem('ls_csrf_token')).toBe('persisted-token');
    });

    it('overwrites previous value', () => {
      storeCsrfToken('old');
      storeCsrfToken('new');
      expect(getCsrfToken()).toBe('new');
      expect(localStorage.getItem('ls_csrf_token')).toBe('new');
    });

    it('returns in-memory token when setItem fails and localStorage holds stale value', () => {
      // Store an initial token successfully
      storeCsrfToken('old-token');
      expect(getCsrfToken()).toBe('old-token');

      // Simulate setItem throwing (e.g. QuotaExceededError) — old value
      // remains readable in localStorage
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      });

      storeCsrfToken('new-token');

      // getCsrfToken must return the new in-memory token, not the stale
      // localStorage value
      expect(getCsrfToken()).toBe('new-token');
      // spy restored by afterEach
    });

    it('recovers from write failure when another path updates localStorage', () => {
      // Store initial token
      storeCsrfToken('old-token');

      // Simulate setItem failure — puts module in write-failed state
      const spy = jest
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new DOMException('quota exceeded', 'QuotaExceededError');
        });
      storeCsrfToken('new-token');
      expect(getCsrfToken()).toBe('new-token');

      // Restore spy so real localStorage.setItem works again
      spy.mockRestore();

      // Another code path (e.g. AuthService) successfully writes a newer token
      localStorage.setItem('ls_csrf_token', 'recovered-token');

      // getCsrfToken should recover and use the newer localStorage value
      expect(getCsrfToken()).toBe('recovered-token');
    });
  });

  describe('clearCsrfToken', () => {
    it('clears localStorage and in-memory', () => {
      storeCsrfToken('to-clear');
      clearCsrfToken();
      expect(getCsrfToken()).toBe('');
      expect(localStorage.getItem('ls_csrf_token')).toBeNull();
    });
  });
});
