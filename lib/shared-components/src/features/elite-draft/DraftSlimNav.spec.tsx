import React from 'react';
import { Platform } from 'react-native';
import { fireEvent } from '@testing-library/react';
import { DraftSlimNav } from './DraftSlimNav';
import { render, screen } from '../../test-utils';

const originalOS = Platform.OS;

function setPlatform(os: typeof Platform.OS): void {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

afterEach(() => {
  setPlatform(originalOS);
});

describe('DraftSlimNav', () => {
  it('renders back + league title on native, where no app header exists', () => {
    setPlatform('ios');
    const onBack = jest.fn();

    render(<DraftSlimNav leagueName="Dead Ball Dynasty" onBack={onBack} />);

    expect(screen.getByTestId('draft-slim-nav')).toBeTruthy();
    expect(screen.getByText('Dead Ball Dynasty')).toBeTruthy();
    fireEvent.click(screen.getByTestId('draft-slim-nav-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  // The app header stays up on the web draft route and already carries the
  // menu and the league — a second bar would stack on top of it (LS-10165).
  it('renders nothing on web', () => {
    setPlatform('web');

    render(<DraftSlimNav leagueName="Dead Ball Dynasty" onBack={jest.fn()} />);

    expect(screen.queryByTestId('draft-slim-nav')).toBeNull();
    expect(screen.queryByText('Dead Ball Dynasty')).toBeNull();
  });
});
