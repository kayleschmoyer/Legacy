/**
 * LS-10735 regression: the dues amount had no upper bound, so an amount over
 * ~$21.4M overflowed GraphQL `Int` and the raw coercion error reached the
 * toast. The form now enforces the shared $10,000 cap inline (Save disabled)
 * and never forwards raw request-level GraphQL text to `onError`.
 */
import React from 'react';
import { CombinedGraphQLErrors } from '@apollo/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { LeagueDuesControl } from './LeagueDuesControl';

const mockUseSettings = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@legacy-sports/graphql', () => ({
  useGetLeagueDuesSettingsQuery: (...args: unknown[]): unknown =>
    mockUseSettings(...args),
  useUpdateDuesSettingsMutation: () => [mockUpdate, { loading: false }],
}));

jest.mock('@tamagui/lucide-icons', () => {
  const Icon = () => <span />;
  return new Proxy({}, { get: () => Icon });
});

// Plain-DOM tamagui stand-ins that forward the props under test: the amount
// input's value/aria wiring, the error text's id/role, and Save's disabled
// state + press handler.
jest.mock('tamagui', () => {
  const ReactActual: typeof React = jest.requireActual('react');
  const pickDomProps = (props: Record<string, unknown>) => {
    const dom: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (key === 'id' || key === 'role' || key.startsWith('aria-')) {
        dom[key] = value;
      }
    }
    return dom;
  };
  const Passthrough = ({
    children,
    ...props
  }: { children?: React.ReactNode } & Record<string, unknown>) =>
    ReactActual.createElement('div', pickDomProps(props), children);
  return {
    createTokens: (tokens: unknown) => tokens,
    Button: ({
      children,
      onPress,
      disabled,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
    }) => (
      <button type="button" onClick={onPress} disabled={disabled}>
        {children}
      </button>
    ),
    Card: Passthrough,
    H4: Passthrough,
    Input: ({
      value,
      onChangeText,
      ...props
    }: {
      value?: string;
      onChangeText?: (text: string) => void;
    } & Record<string, unknown>) => (
      <input
        value={value ?? ''}
        onChange={(e) => onChangeText?.(e.target.value)}
        {...pickDomProps(props)}
      />
    ),
    Separator: () => <hr />,
    Spinner: () => <span />,
    Text: Passthrough,
    XStack: Passthrough,
    YStack: Passthrough,
  };
});

const amountInput = () => screen.getByRole('textbox', { name: 'Dues Amount' });
const saveButton = () => screen.getByRole('button', { name: 'Save Settings' });

const RAW_COERCION_TEXT =
  'Variable "$input" got invalid value 99999999900 at "input.amountCents"; Int cannot represent non 32-bit signed integer value: 99999999900';

describe('LeagueDuesControl amount validation (LS-10735)', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockUseSettings.mockReset();
    mockUseSettings.mockReturnValue({
      data: {
        leagueDuesSettings: {
          id: 1,
          leagueId: 1,
          enabled: true,
          amountCents: 1235,
          reminderEnabled: false,
          reminderDayOfWeek: 1,
        },
      },
      loading: false,
    });
  });

  it('shows an inline error and disables Save for an amount above $10,000', () => {
    render(<LeagueDuesControl leagueId={1} />);

    fireEvent.change(amountInput(), { target: { value: '999999999' } });

    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Dues amount cannot exceed $10,000');
    expect(amountInput()).toHaveAttribute('aria-invalid', 'true');
    expect(amountInput()).toHaveAttribute('aria-describedby', error.id);
    expect(saveButton()).toBeDisabled();

    fireEvent.click(saveButton());
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('allows saving exactly $10,000', async () => {
    mockUpdate.mockResolvedValue({});
    render(<LeagueDuesControl leagueId={1} />);

    fireEvent.change(amountInput(), { target: { value: '10000' } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(amountInput()).toHaveAttribute('aria-invalid', 'false');
    expect(saveButton()).toBeEnabled();

    fireEvent.click(saveButton());
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][0].variables.input.amountCents).toBe(
      1_000_000,
    );
  });

  it('keeps the existing greater-than-$0 check', () => {
    render(<LeagueDuesControl leagueId={1} />);

    fireEvent.change(amountInput(), { target: { value: '0' } });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please enter a valid dues amount greater than $0',
    );
    expect(saveButton()).toBeDisabled();
  });

  it.each([
    [
      'a variable-coercion GraphQL error (no path)',
      () =>
        new CombinedGraphQLErrors({
          errors: [
            {
              message: RAW_COERCION_TEXT,
              extensions: { code: 'BAD_USER_INPUT' },
            },
          ],
        }),
    ],
    ['a plain network error', () => new Error(RAW_COERCION_TEXT)],
  ])('never forwards raw text to onError for %s', async (_label, makeErr) => {
    mockUpdate.mockRejectedValue(makeErr());
    const onError = jest.fn();
    render(<LeagueDuesControl leagueId={1} onError={onError} />);

    fireEvent.change(amountInput(), { target: { value: '50' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    const message = (onError.mock.calls[0][0] as Error).message;
    expect(message).not.toContain('Int cannot represent');
    expect(message).not.toContain('$input');
    expect(message).toBe(
      "Couldn't save dues settings. Please check the amount and try again.",
    );
  });

  it('forwards the friendly message from a resolver-raised input error', async () => {
    mockUpdate.mockRejectedValue(
      new CombinedGraphQLErrors({
        errors: [
          {
            message: 'Dues amount cannot exceed $10,000',
            path: ['updateDuesSettings'],
            extensions: { code: 'BAD_USER_INPUT' },
          },
        ],
      }),
    );
    const onError = jest.fn();
    render(<LeagueDuesControl leagueId={1} onError={onError} />);

    fireEvent.change(amountInput(), { target: { value: '50' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect((onError.mock.calls[0][0] as Error).message).toBe(
      'Dues amount cannot exceed $10,000',
    );
  });
});
