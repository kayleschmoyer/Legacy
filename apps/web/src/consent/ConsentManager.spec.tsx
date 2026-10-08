import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ConsentManager, CookieSettingsButton } from './ConsentManager';
import { getConsentSnapshot, resetConsentStoreForTests } from './consentStore';
import { isConsentRequiredRegion } from './consentRegion';

jest.mock('./consentRegion', () => ({
  isConsentRequiredRegion: jest.fn(),
}));

// Shared components have their own specs; stub them to their callbacks.
jest.mock('@legacy-sports/shared-components/ui', () => ({
  ConsentBanner: ({
    onAcceptAll,
    onRejectAll,
    onManage,
  }: {
    onAcceptAll: () => void;
    onRejectAll: () => void;
    onManage: () => void;
  }) => (
    <div data-testid="consent-banner">
      <button onClick={onAcceptAll}>Accept all</button>
      <button onClick={onRejectAll}>Reject all</button>
      <button onClick={onManage}>Manage choices</button>
    </div>
  ),
  ConsentPreferencesDialog: ({
    open,
    analyticsEnabled,
    onSave,
    onClose,
  }: {
    open: boolean;
    analyticsEnabled: boolean;
    onSave: (analytics: boolean) => void;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="consent-preferences">
        <span>analytics:{String(analyticsEnabled)}</span>
        <button onClick={() => onSave(!analyticsEnabled)}>Save choices</button>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

const mockRegion = isConsentRequiredRegion as jest.MockedFunction<
  typeof isConsentRequiredRegion
>;

describe('ConsentManager (LS-10764)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetConsentStoreForTests();
  });

  it('shows the banner to an EU/UK visitor and saves Reject', () => {
    mockRegion.mockReturnValue(true);
    render(<ConsentManager />);

    fireEvent.click(screen.getByText('Reject all'));

    expect(screen.queryByTestId('consent-banner')).toBeNull();
    expect(getConsentSnapshot()).toMatchObject({
      analytics: false,
      decided: true,
    });
    expect(screen.getByTestId('consent-announcer').textContent).toBe(
      'Your choices are saved.',
    );
  });

  it('opens the Manage panel from the banner in place of the banner', () => {
    mockRegion.mockReturnValue(true);
    render(<ConsentManager />);

    fireEvent.click(screen.getByText('Manage choices'));

    expect(screen.queryByTestId('consent-banner')).toBeNull();
    expect(screen.getByTestId('consent-preferences')).toBeTruthy();

    // Close without saving brings the banner back.
    fireEvent.click(screen.getByText('Close'));
    expect(screen.getByTestId('consent-banner')).toBeTruthy();
  });

  it('shows no banner to a non-EU visitor', () => {
    mockRegion.mockReturnValue(false);
    render(<ConsentManager />);
    expect(screen.queryByTestId('consent-banner')).toBeNull();
  });

  it('Cookie settings opens the panel pre-filled and returns focus on close', () => {
    mockRegion.mockReturnValue(false);
    render(
      <>
        <CookieSettingsButton />
        <ConsentManager />
      </>,
    );
    const trigger = screen.getByTestId('cookie-settings-button');
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByText('analytics:true')).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByText('Close'));
    });
    expect(screen.queryByTestId('consent-preferences')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
