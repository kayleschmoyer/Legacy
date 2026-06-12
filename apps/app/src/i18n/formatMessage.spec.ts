import type { MessageId } from './messages';
import { formatMessage } from './index';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Typing warn as jest.Mock (not the original method) sidesteps
// @typescript-eslint/unbound-method; requireMock returns the live mock instance.
const { LOGGER } = jest.requireMock<{ LOGGER: { warn: jest.Mock } }>(
  '@legacy-sports/logging',
);

// The exact set of IDs the Share screen requested in the LS-7958 logcat capture.
const SHARE_SCREEN_IDS: MessageId[] = ['2F5EsD', 'PA8TUT', '0uDEd6', 'y2oJvM'];

describe('formatMessage (LS-7958)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves every Share-screen message ID from the capture without warning', () => {
    for (const id of SHARE_SCREEN_IDS) {
      const value = formatMessage(id);
      expect(value).toBeTruthy();
      // A real value, not the raw-id fallback.
      expect(value).not.toBe(id);
    }
    expect(LOGGER.warn).not.toHaveBeenCalled();
  });

  it('returns the known en-US copy for each ID', () => {
    expect(formatMessage('2F5EsD')).toBe('Invite Friends');
    expect(formatMessage('PA8TUT')).toBe(
      'Choose a league to share an invite link',
    );
    expect(formatMessage('0uDEd6')).toBe(
      'Create or join a league first, then share an invite link so friends can join you.',
    );
    expect(formatMessage('y2oJvM')).toBe('Close');
  });

  it('warns with the runtime diagnostic and falls back to the id for an unknown message', () => {
    expect(formatMessage('missingId')).toBe('missingId');
    expect(LOGGER.warn).toHaveBeenCalledWith(
      'Requested message missingId does not have a value in the requested locale en-US nor the default locale en-US',
    );
  });

  it('falls back to the default locale (no warning) for an unknown locale', () => {
    expect(formatMessage('y2oJvM', 'fr-FR')).toBe('Close');
    expect(LOGGER.warn).not.toHaveBeenCalled();
  });

  it('reports the requested locale in the diagnostic when both locale and id miss', () => {
    expect(formatMessage('missingId', 'fr-FR')).toBe('missingId');
    expect(LOGGER.warn).toHaveBeenCalledWith(
      'Requested message missingId does not have a value in the requested locale fr-FR nor the default locale en-US',
    );
  });
});
