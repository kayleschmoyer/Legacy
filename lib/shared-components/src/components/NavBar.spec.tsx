import React from 'react';
import { NavBar } from './NavBar';
import { fireEvent, render } from '../test-utils';
import { Platform } from '../platform-components';

// Real `<a href>` rendering is web-only; native keeps the plain pressable pill.
const describeWeb = Platform.OS === 'web' ? describe : describe.skip;

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

  it('activates the link pill with the Enter key', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <NavBar links={[{ label: 'Players', href: '/players', onPress }]} />,
    );
    fireEvent.keyDown(getByRole('link', { name: /players/i }), {
      key: 'Enter',
    });
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

  it('renders only the brand and trailing slots when links is empty (LS-10767)', () => {
    const { getByText, queryByRole } = render(
      <NavBar brand="" links={[]} trailing={<span>Sign in</span>} />,
    );
    expect(getByText('Sign in')).toBeTruthy();
    expect(queryByRole('link')).toBeNull();
    expect(queryByRole('button')).toBeNull();
  });

  describeWeb('web anchor rendering (LS-10779)', () => {
    it('renders an href pill as a real anchor so it can open in a new tab (LS-10779)', () => {
      const { getByRole } = render(
        <NavBar
          links={[
            { label: 'Players', href: '/players', onPress: jest.fn() },
            { label: 'Minigames', href: '/games', onPress: jest.fn() },
          ]}
        />,
      );
      const players = getByRole('link', { name: /players/i });
      expect(players.tagName).toBe('A');
      expect(players.getAttribute('href')).toBe('/players');
      expect(
        getByRole('link', { name: /minigames/i }).getAttribute('href'),
      ).toBe('/games');
    });

    it('prevents the full-page load on a plain click and navigates via onPress', () => {
      const onPress = jest.fn();
      const { getByRole } = render(
        <NavBar links={[{ label: 'Players', href: '/players', onPress }]} />,
      );
      const notCancelled = fireEvent.click(
        getByRole('link', { name: /players/i }),
      );
      expect(notCancelled).toBe(false);
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }])(
      'leaves a modified click (%o) to the browser',
      (modifier) => {
        const onPress = jest.fn();
        const { getByRole } = render(
          <NavBar links={[{ label: 'Players', href: '/players', onPress }]} />,
        );
        const notCancelled = fireEvent.click(
          getByRole('link', { name: /players/i }),
          modifier,
        );
        expect(notCancelled).toBe(true);
        expect(onPress).not.toHaveBeenCalled();
      },
    );
  });
});
