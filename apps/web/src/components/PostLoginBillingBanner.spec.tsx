import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { PostLoginBillingBanner } from './PostLoginBillingBanner';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockConsumeBillingNotice = jest.fn<'past_due' | null, []>();
jest.mock('@legacy-sports/shared-components/auth', () => ({
  consumeBillingNotice: (): 'past_due' | null => mockConsumeBillingNotice(),
}));

type Props = { children?: React.ReactNode; onPress?: () => void } & Record<
  string,
  unknown
>;

jest.mock('@legacy-sports/shared-components/ui', () => {
  const PassThrough = ({ children }: Props) => <div>{children}</div>;
  const Button = ({ children, onPress, ...rest }: Props) => (
    <button
      type="button"
      onClick={onPress}
      aria-label={rest['aria-label'] as string | undefined}
    >
      {children}
    </button>
  );
  return {
    XStack: PassThrough,
    Paragraph: ({ children }: Props) => <span>{children}</span>,
    Button,
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  AlertTriangle: () => null,
  X: () => null,
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PostLoginBillingBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when there is no past_due notice', () => {
    mockConsumeBillingNotice.mockReturnValue(null);
    render(<PostLoginBillingBanner />);
    expect(
      screen.queryByTestId('post-login-billing-banner'),
    ).not.toBeInTheDocument();
  });

  it("renders the billing hint when the notice is 'past_due'", () => {
    mockConsumeBillingNotice.mockReturnValue('past_due');
    render(<PostLoginBillingBanner />);
    expect(screen.getByTestId('post-login-billing-banner')).toBeInTheDocument();
    expect(
      screen.getByText(/premium subscription needs attention/i),
    ).toBeInTheDocument();
  });

  it('navigates to /subscription when "Open Billing" is pressed', () => {
    mockConsumeBillingNotice.mockReturnValue('past_due');
    render(<PostLoginBillingBanner />);
    fireEvent.click(screen.getByText('Open Billing'));
    expect(mockNavigate).toHaveBeenCalledWith('/subscription');
  });

  it('dismisses the banner when the close button is pressed', () => {
    mockConsumeBillingNotice.mockReturnValue('past_due');
    render(<PostLoginBillingBanner />);
    fireEvent.click(screen.getByLabelText('Dismiss billing notice'));
    expect(
      screen.queryByTestId('post-login-billing-banner'),
    ).not.toBeInTheDocument();
  });

  it('consumes the notice only once (one-shot on mount)', () => {
    mockConsumeBillingNotice.mockReturnValue('past_due');
    render(<PostLoginBillingBanner />);
    expect(mockConsumeBillingNotice).toHaveBeenCalledTimes(1);
  });
});
