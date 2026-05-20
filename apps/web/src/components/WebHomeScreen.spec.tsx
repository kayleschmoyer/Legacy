/* eslint-disable @typescript-eslint/no-explicit-any -- test mock props use any for simplicity */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WebHomeScreen } from './WebHomeScreen';

jest.mock('@legacy-sports/shared-components/ui', () => ({
  Button: ({ children, onPress, disabled, ...rest }: any) => (
    <button onClick={onPress} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
  Card: ({ children, title, ...rest }: any) => (
    <div data-card-title={title} {...rest}>
      {children}
    </div>
  ),
  H1: ({ children, ...rest }: any) => <h1 {...rest}>{children}</h1>,
  H2: ({ children, ...rest }: any) => <h2 {...rest}>{children}</h2>,
  Paragraph: ({ children, ...rest }: any) => <p {...rest}>{children}</p>,
  XStack: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
  YStack: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
}));

jest.mock('tamagui', () => ({
  ScrollView: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

function renderHome() {
  return render(
    <MemoryRouter>
      <WebHomeScreen />
    </MemoryRouter>,
  );
}

describe('WebHomeScreen — Football notify CTA', () => {
  it('renders the Football card with a "Notify Me When Available" button initially', () => {
    renderHome();
    const button = screen.getByRole('button', {
      name: /notify me when available/i,
    });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('switches the button to a disabled "Thanks!" acknowledgement after click', () => {
    renderHome();
    const button = screen.getByRole('button', {
      name: /notify me when available/i,
    });
    fireEvent.click(button);

    const ack = screen.getByRole('button', {
      name: /thanks! we'll notify you/i,
    });
    expect(ack).toBeInTheDocument();
    expect(ack).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /notify me when available/i }),
    ).not.toBeInTheDocument();
  });
});
