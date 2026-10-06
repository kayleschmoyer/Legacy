import React from 'react';
import { render } from '@testing-library/react';
import { HomeScreen, type HomeScreenProps } from './HomeScreen';

// Web-only: asserts DOM focus (document.activeElement) on the empty-state CTA.
// Excluded from the mobile jest project (see jest.config.mobile.ts).

const baseProps: HomeScreenProps = {
  userName: 'Casey',
  leagues: [],
  onViewLeague: jest.fn(),
  onCreateLeague: jest.fn(),
  onJoinLeague: jest.fn(),
  onBrowseStats: jest.fn(),
  onViewSport: jest.fn(),
};

describe('focusCtaRequest (LS-6918)', () => {
  it('does not move focus on first render', () => {
    const { getByTestId } = render(<HomeScreen {...baseProps} />);
    expect(document.activeElement).not.toBe(getByTestId('home-empty-create'));
  });

  it('focuses the Create League CTA when the request counter is bumped and focus was lost', () => {
    const { getByTestId, rerender } = render(<HomeScreen {...baseProps} />);
    rerender(<HomeScreen {...baseProps} focusCtaRequest={1} />);
    expect(document.activeElement).toBe(getByTestId('home-empty-create'));
  });

  it('leaves focus alone when it already sits on a real control', () => {
    const other = document.createElement('button');
    document.body.appendChild(other);
    const { getByTestId, rerender } = render(<HomeScreen {...baseProps} />);
    other.focus();
    rerender(<HomeScreen {...baseProps} focusCtaRequest={1} />);
    expect(document.activeElement).toBe(other);
    expect(document.activeElement).not.toBe(getByTestId('home-empty-create'));
    other.remove();
  });
});
