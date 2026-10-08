import React from 'react';
import { ConsentBanner } from './ConsentBanner';
import { fireEvent, render, screen } from '../../test-utils';

let mockIsPhone = false;

jest.mock('tamagui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const passThrough =
    (tag: string) =>
    ({
      children,
      role,
      href,
      ...rest
    }: {
      children?: React.ReactNode;
      role?: string;
      href?: string;
      [k: string]: unknown;
    }) =>
      React.createElement(
        tag,
        {
          role,
          href,
          'aria-label': rest['aria-label'],
          'data-testid': rest['data-testid'],
        },
        children,
      );
  return {
    YStack: passThrough('div'),
    XStack: passThrough('div'),
    Text: passThrough('span'),
    Anchor: passThrough('a'),
    useMedia: () => ({ xxs: mockIsPhone }),
  };
});

jest.mock('../../Button', () => ({
  Button: ({
    children,
    onPress,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
  }) => <button onClick={onPress}>{children}</button>,
}));

function renderBanner() {
  const handlers = {
    onAcceptAll: jest.fn(),
    onRejectAll: jest.fn(),
    onManage: jest.fn(),
  };
  render(<ConsentBanner {...handlers} />);
  return handlers;
}

function buttonLabels(): string[] {
  return screen.getAllByRole('button').map((b) => b.textContent ?? '');
}

describe('ConsentBanner (LS-10764)', () => {
  beforeEach(() => {
    mockIsPhone = false;
  });

  it('is a labelled, non-modal region with a Privacy Policy link', () => {
    renderBanner();
    expect(screen.getByRole('region', { name: 'Cookie consent' })).toBeTruthy();
    expect(
      screen.getByText('Privacy Policy').closest('a')?.getAttribute('href'),
    ).toBe('/privacy');
  });

  it('wires each button to its handler', () => {
    const handlers = renderBanner();
    fireEvent.click(screen.getByText('Accept all'));
    fireEvent.click(screen.getByText('Reject all'));
    fireEvent.click(screen.getByText('Manage choices'));
    expect(handlers.onAcceptAll).toHaveBeenCalledTimes(1);
    expect(handlers.onRejectAll).toHaveBeenCalledTimes(1);
    expect(handlers.onManage).toHaveBeenCalledTimes(1);
  });

  it('orders Reject, Accept, Manage on wide viewports', () => {
    renderBanner();
    expect(buttonLabels()).toEqual([
      'Reject all',
      'Accept all',
      'Manage choices',
    ]);
  });

  it('stacks Accept, Reject, Manage on phones (DOM order = visual order)', () => {
    mockIsPhone = true;
    renderBanner();
    expect(buttonLabels()).toEqual([
      'Accept all',
      'Reject all',
      'Manage choices',
    ]);
  });
});
