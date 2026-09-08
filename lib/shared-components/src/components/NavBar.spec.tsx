import React from 'react';
import { NavBar } from './NavBar';
import { fireEvent, render } from '../test-utils';

describe('NavBar', () => {
  it('exposes role="link" when the NavLink provides an href', () => {
    const onPress = jest.fn();
    const { getByRole, queryByRole } = render(
      <NavBar links={[{ label: 'Players', href: '/players', onPress }]} />,
    );
    expect(getByRole('link', { name: /players/i })).toBeTruthy();
    expect(queryByRole('button', { name: /players/i })).toBeNull();
  });

  it('fires onPress when the link pill is clicked', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <NavBar links={[{ label: 'Players', href: '/players', onPress }]} />,
    );
    fireEvent.click(getByRole('link', { name: /players/i }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('falls back to a role="button" pill when no href is provided', () => {
    const onPress = jest.fn();
    const { getByRole, queryByRole } = render(
      <NavBar links={[{ label: 'Search', onPress }]} />,
    );
    expect(queryByRole('link', { name: /search/i })).toBeNull();
    const button = getByRole('button', { name: /search/i });
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
