import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UseMfaResult } from '@legacy-sports/shared-components/auth';
import TwoFactorSection from './TwoFactorSection';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg data-testid="qr-code" data-value={value} />
  ),
}));

type Props = {
  children?: React.ReactNode;
  onPress?: () => void;
  'data-testid'?: string;
} & Record<string, unknown>;

jest.mock('tamagui', () => {
  const testId = (rest: Record<string, unknown>) =>
    rest['testID'] ?? rest['data-testid'];
  const Pass = ({ children, onPress, ...rest }: Props) => (
    <div
      {...(testId(rest) ? { 'data-testid': testId(rest) as string } : {})}
      onClick={onPress}
    >
      {children}
    </div>
  );
  return {
    YStack: Pass,
    XStack: Pass,
    Paragraph: ({ children, ...rest }: Props) => (
      <span
        {...(testId(rest) ? { 'data-testid': testId(rest) as string } : {})}
      >
        {children}
      </span>
    ),
    Separator: () => <hr />,
    Spinner: () => <span>spinner</span>,
    styled: (C: React.ElementType, _config?: unknown) => C,
    Input: ({
      value,
      onChangeText,
      placeholder,
      'aria-label': ariaLabel,
      ...rest
    }: Props & { onChangeText?: (v: string) => void }) => (
      <input
        aria-label={ariaLabel as string | undefined}
        placeholder={placeholder as string | undefined}
        value={(value as string) ?? ''}
        onChange={(e) => onChangeText?.(e.target.value)}
        data-testid={rest['data-testid']}
      />
    ),
  };
});

jest.mock('../../constants/colors', () => ({
  BG_DARK: '#000',
  BRAND_GOLD: '#gold',
  BRAND_GOLD_LIGHT: '#goldlight',
  BRAND_NAVY: '#navy',
  BRAND_NAVY_LIGHT: '#navylight',
  BRAND_SEAM_RED: '#red',
  EMERALD: '#emerald',
  EMERALD_DARK: '#emeralddark',
  GREEN: '#green',
  withAlpha: (c: string, _a: number) => c,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildMfa(overrides: Partial<UseMfaResult> = {}): UseMfaResult {
  return {
    mfaEnabled: false,
    isLoading: false,
    error: null,
    enrollData: null,
    startEnrollment: jest.fn().mockResolvedValue(undefined),
    verifySetup: jest.fn().mockResolvedValue(undefined),
    disable: jest.fn().mockResolvedValue(undefined),
    cancelEnrollment: jest.fn(),
    clearError: jest.fn(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TwoFactorSection — disabled state', () => {
  it('renders the Enable 2FA button when MFA is disabled', () => {
    render(<TwoFactorSection mfa={buildMfa()} />);
    expect(screen.getByTestId('2fa-enable-button')).toBeInTheDocument();
    expect(screen.queryByTestId('2fa-disable-button')).not.toBeInTheDocument();
  });

  it('calls startEnrollment when Enable 2FA is clicked', async () => {
    const mfa = buildMfa();
    render(<TwoFactorSection mfa={mfa} />);
    fireEvent.click(screen.getByTestId('2fa-enable-button'));
    await waitFor(() => expect(mfa.startEnrollment).toHaveBeenCalledTimes(1));
  });

  it('shows an error message when error is set', () => {
    render(
      <TwoFactorSection
        mfa={buildMfa({ error: 'Failed to start enrollment' })}
      />,
    );
    expect(screen.getByTestId('2fa-error')).toHaveTextContent(
      'Failed to start enrollment',
    );
  });
});

describe('TwoFactorSection — enrollment flow', () => {
  const enrollData = {
    secret: 'JBSWY3DPEHPK3PXP',
    otpauthUri:
      'otpauth://totp/Legacy%20Sports:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Legacy%20Sports',
  };

  it('renders the QR code and secret when enrollData is set', () => {
    render(<TwoFactorSection mfa={buildMfa({ enrollData })} />);
    expect(screen.getByTestId('qr-code')).toBeInTheDocument();
    expect(screen.getByTestId('2fa-code-input')).toBeInTheDocument();
    expect(screen.getByTestId('2fa-verify-button')).toBeInTheDocument();
  });

  it('the QR code encodes the otpauthUri', () => {
    render(<TwoFactorSection mfa={buildMfa({ enrollData })} />);
    expect(screen.getByTestId('qr-code')).toHaveAttribute(
      'data-value',
      enrollData.otpauthUri,
    );
  });

  it('calls verifySetup with the entered code', async () => {
    const mfa = buildMfa({ enrollData });
    render(<TwoFactorSection mfa={mfa} />);

    fireEvent.change(screen.getByTestId('2fa-code-input'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByTestId('2fa-verify-button'));

    await waitFor(() => expect(mfa.verifySetup).toHaveBeenCalledWith('123456'));
  });

  it('shows an invalid-code error returned from verifySetup', () => {
    render(
      <TwoFactorSection
        mfa={buildMfa({ enrollData, error: 'Invalid code' })}
      />,
    );
    expect(screen.getByTestId('2fa-error')).toHaveTextContent('Invalid code');
  });

  it('calls cancelEnrollment when Cancel is clicked', () => {
    const mfa = buildMfa({ enrollData });
    render(<TwoFactorSection mfa={mfa} />);
    fireEvent.click(screen.getByTestId('2fa-cancel-button'));
    expect(mfa.cancelEnrollment).toHaveBeenCalled();
  });
});

describe('TwoFactorSection — enabled state', () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => confirmSpy.mockRestore());

  it('renders the Disable 2FA button when MFA is enabled', () => {
    render(<TwoFactorSection mfa={buildMfa({ mfaEnabled: true })} />);
    expect(screen.getByTestId('2fa-disable-button')).toBeInTheDocument();
    expect(screen.queryByTestId('2fa-enable-button')).not.toBeInTheDocument();
  });

  it('calls disable after the user confirms', async () => {
    confirmSpy.mockReturnValue(true);
    const mfa = buildMfa({ mfaEnabled: true });
    render(<TwoFactorSection mfa={mfa} />);
    fireEvent.click(screen.getByTestId('2fa-disable-button'));
    await waitFor(() => expect(mfa.disable).toHaveBeenCalledTimes(1));
  });

  it('does NOT call disable when the user cancels the confirmation', () => {
    confirmSpy.mockReturnValue(false);
    const mfa = buildMfa({ mfaEnabled: true });
    render(<TwoFactorSection mfa={mfa} />);
    fireEvent.click(screen.getByTestId('2fa-disable-button'));
    expect(mfa.disable).not.toHaveBeenCalled();
  });
});

describe('TwoFactorSection — loading state', () => {
  it('renders a spinner while mfaEnabled is null', () => {
    render(<TwoFactorSection mfa={buildMfa({ mfaEnabled: null })} />);
    expect(screen.getByText('spinner')).toBeInTheDocument();
  });
});

describe('TwoFactorSection — clipboard copy', () => {
  const enrollData = {
    secret: 'JBSWY3DPEHPK3PXP',
    otpauthUri:
      'otpauth://totp/Legacy%20Sports:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Legacy%20Sports',
  };

  let writeTextMock: jest.Mock;

  beforeEach(() => {
    writeTextMock = jest.fn();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });
  });

  it('sets copiedSecret to true on successful clipboard write', async () => {
    writeTextMock.mockResolvedValue(undefined);
    render(<TwoFactorSection mfa={buildMfa({ enrollData })} />);

    // The Copy text lives inside the ActionButton div — click the parent div directly
    const copySpan = screen.getByText('Copy');
    fireEvent.click(copySpan.parentElement!);

    await waitFor(() =>
      expect(screen.getByText('Copied!')).toBeInTheDocument(),
    );
    expect(writeTextMock).toHaveBeenCalledWith(enrollData.secret);
  });

  it('keeps copiedSecret false when clipboard write fails', async () => {
    writeTextMock.mockRejectedValue(new Error('Permission denied'));
    render(<TwoFactorSection mfa={buildMfa({ enrollData })} />);

    const copySpan = screen.getByText('Copy');
    fireEvent.click(copySpan.parentElement!);

    // Give the rejected promise a tick to settle
    await waitFor(() =>
      expect(screen.queryByText('Copied!')).not.toBeInTheDocument(),
    );
    expect(writeTextMock).toHaveBeenCalledWith(enrollData.secret);
  });
});
