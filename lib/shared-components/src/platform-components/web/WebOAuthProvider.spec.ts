import { WebOAuthProvider } from './WebOAuthProvider';

// Mock LOGGER to avoid console output in tests
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Capture the config passed to google.accounts.id.initialize
let capturedGsiConfig: Record<string, unknown> | undefined;
let promptCallback:
  | ((notification: Record<string, unknown>) => void)
  | undefined;

function createMockGoogleAccounts() {
  return {
    google: {
      accounts: {
        id: {
          initialize: jest.fn((config: Record<string, unknown>) => {
            capturedGsiConfig = config;
          }),
          prompt: jest.fn(
            (cb?: (notification: Record<string, unknown>) => void) => {
              promptCallback = cb;
            },
          ),
          cancel: jest.fn(),
          renderButton: jest.fn(),
        },
        oauth2: {
          initCodeClient: jest.fn(),
        },
      },
    },
  };
}

const DESKTOP_CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DESKTOP_FIREFOX_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0';

const MOBILE_CHROME_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const IPHONE_SAFARI_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// Alias for clarity in tests that target generic desktop (non-Chromium) behaviour
const DESKTOP_USER_AGENT = DESKTOP_FIREFOX_USER_AGENT;

describe('WebOAuthProvider', () => {
  const originalUserAgent = navigator.userAgent;
  const originalLocation = window.location;
  let provider: WebOAuthProvider;

  function setLocation(hostname: string) {
    // JSDOM does not allow cross-origin pushState, so we replace
    // window.location with a minimal stub that satisfies the implementation's
    // `window.location.hostname` check.
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, hostname },
      writable: true,
      configurable: true,
    });
  }

  beforeEach(() => {
    capturedGsiConfig = undefined;
    promptCallback = undefined;
    provider = new WebOAuthProvider();

    // Set up window.google mock
    const mock = createMockGoogleAccounts();
    Object.defineProperty(window, 'google', {
      value: mock.google,
      writable: true,
      configurable: true,
    });

    // Default to production hostname
    setLocation('legacy-fantasy.com');
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  function setUserAgent(ua: string) {
    Object.defineProperty(navigator, 'userAgent', {
      value: ua,
      writable: true,
      configurable: true,
    });
  }

  async function configureProvider() {
    await provider.configure({
      googleClientId: 'test-client-id',
      gsi: { oneTap: true },
    });
    // Flush the setTimeout(100) used in configure()
    jest.advanceTimersByTime(150);
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('FedCM configuration on mobile browsers', () => {
    it('should enable FedCM on mobile Chrome (Android)', async () => {
      setUserAgent(MOBILE_CHROME_USER_AGENT);
      await configureProvider();

      expect(capturedGsiConfig).toBeDefined();
      expect(capturedGsiConfig?.use_fedcm_for_prompt).toBe(true);
    });

    it('should enable FedCM on iPhone Safari', async () => {
      setUserAgent(IPHONE_SAFARI_USER_AGENT);
      await configureProvider();

      expect(capturedGsiConfig).toBeDefined();
      expect(capturedGsiConfig?.use_fedcm_for_prompt).toBe(true);
    });

    it('should enable FedCM on desktop Chrome (production)', async () => {
      setUserAgent(DESKTOP_CHROME_USER_AGENT);
      await configureProvider();

      expect(capturedGsiConfig).toBeDefined();
      expect(capturedGsiConfig?.use_fedcm_for_prompt).toBe(true);
    });

    it('should disable FedCM on desktop Firefox localhost', async () => {
      setUserAgent(DESKTOP_FIREFOX_USER_AGENT);
      setLocation('localhost');
      await configureProvider();

      expect(capturedGsiConfig).toBeDefined();
      expect(capturedGsiConfig?.use_fedcm_for_prompt).toBe(false);
    });

    it('should still enable FedCM on desktop Chrome localhost (Chrome 120+ requires FedCM regardless)', async () => {
      setUserAgent(DESKTOP_CHROME_USER_AGENT);
      setLocation('localhost');
      await configureProvider();

      expect(capturedGsiConfig).toBeDefined();
      expect(capturedGsiConfig?.use_fedcm_for_prompt).toBe(true);
    });

    it('should still enable FedCM on mobile even on localhost', async () => {
      setUserAgent(MOBILE_CHROME_USER_AGENT);
      setLocation('localhost');
      await configureProvider();

      expect(capturedGsiConfig).toBeDefined();
      expect(capturedGsiConfig?.use_fedcm_for_prompt).toBe(true);
    });
  });

  describe('itp_support configuration', () => {
    it('should always set itp_support to true', async () => {
      setUserAgent(DESKTOP_USER_AGENT);
      await configureProvider();

      expect(capturedGsiConfig).toBeDefined();
      expect(capturedGsiConfig?.itp_support).toBe(true);
    });
  });

  describe('FedCM dismiss retry behavior', () => {
    it('should NOT retry without FedCM on mobile when dismissed', async () => {
      setUserAgent(MOBILE_CHROME_USER_AGENT);
      await configureProvider();

      const initializeMock = window.google?.accounts.id.initialize as jest.Mock;
      const callCountBeforeDismiss = initializeMock.mock.calls.length;

      // Simulate a FedCM dismiss
      promptCallback?.({
        getMomentType: () => 'dismissed',
        getDismissedReason: () => 'cancel_called',
      });

      // Flush any pending timers
      jest.advanceTimersByTime(200);

      // Should NOT have re-initialized (no retry on mobile)
      expect(initializeMock.mock.calls.length).toBe(callCountBeforeDismiss);
    });

    it('should NOT retry without FedCM on desktop Chrome when dismissed (Chrome 120+ dropped iframe prompt)', async () => {
      setUserAgent(DESKTOP_CHROME_USER_AGENT);
      await configureProvider();

      const initializeMock = window.google?.accounts.id.initialize as jest.Mock;
      const callCountBeforeDismiss = initializeMock.mock.calls.length;

      // Simulate a FedCM dismiss that previously triggered a non-FedCM retry
      promptCallback?.({
        getMomentType: () => 'dismissed',
        getDismissedReason: () => 'cancel_called',
      });

      // Should NOT have re-initialized — Chrome 120+ does not support the
      // legacy iframe-based prompt, so retrying without FedCM would silently
      // fail and the user would never see One Tap.
      expect(initializeMock.mock.calls.length).toBe(callCountBeforeDismiss);
    });

    it('should retry without FedCM on desktop Firefox when dismissed with cancel_called', async () => {
      setUserAgent(DESKTOP_FIREFOX_USER_AGENT);
      await configureProvider();

      const initializeMock = window.google?.accounts.id.initialize as jest.Mock;
      const callCountBeforeDismiss = initializeMock.mock.calls.length;

      // Simulate a FedCM dismiss on Firefox (still supports iframe-based prompt)
      promptCallback?.({
        getMomentType: () => 'dismissed',
        getDismissedReason: () => 'cancel_called',
      });

      // Should have re-initialized with FedCM disabled — Firefox supports the
      // legacy iframe-based One Tap prompt as a fallback.
      expect(initializeMock.mock.calls.length).toBe(callCountBeforeDismiss + 1);
      const lastCallArgs = initializeMock.mock.calls[
        initializeMock.mock.calls.length - 1
      ] as [Record<string, unknown>];
      expect(lastCallArgs[0].use_fedcm_for_prompt).toBe(false);
    });

    it('should NOT retry on desktop when dismissed with user_cancel', async () => {
      setUserAgent(DESKTOP_USER_AGENT);
      await configureProvider();

      const initializeMock = window.google?.accounts.id.initialize as jest.Mock;
      const callCountBeforeDismiss = initializeMock.mock.calls.length;

      promptCallback?.({
        getMomentType: () => 'dismissed',
        getDismissedReason: () => 'user_cancel',
      });

      expect(initializeMock.mock.calls.length).toBe(callCountBeforeDismiss);
    });

    it('should NOT retry on desktop when dismissed with credential_returned', async () => {
      setUserAgent(DESKTOP_USER_AGENT);
      await configureProvider();

      const initializeMock = window.google?.accounts.id.initialize as jest.Mock;
      const callCountBeforeDismiss = initializeMock.mock.calls.length;

      promptCallback?.({
        getMomentType: () => 'dismissed',
        getDismissedReason: () => 'credential_returned',
      });

      expect(initializeMock.mock.calls.length).toBe(callCountBeforeDismiss);
    });
  });
});
