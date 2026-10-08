import React, { useEffect, useState } from 'react';
import {
  ConsentBanner,
  ConsentPreferencesDialog,
} from '@legacy-sports/shared-components/ui';
import {
  closeCookieSettings,
  isConsentBannerVisible,
  openCookieSettings,
  saveConsent,
  takeReturnFocusTarget,
  useConsent,
} from './consentStore';
import { NAV_Z_INDEX } from '../constants/dimensions';

/**
 * Above the nav and the phone bottom bar (both NAV_Z_INDEX) so the banner's
 * buttons are never covered, below toasts (9999) per the design spec.
 */
const CONSENT_BANNER_Z_INDEX = NAV_Z_INDEX + 100;

const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

/**
 * Mounts the analytics consent banner and the "Privacy choices" panel
 * (LS-10764). Rendered once, right after the skip link, so keyboard and
 * screen-reader users reach the banner first.
 */
export function ConsentManager(): React.JSX.Element {
  const consent = useConsent();
  const [announcement, setAnnouncement] = useState('');

  // Return focus to whatever opened the panel (a Cookie settings link or the
  // banner's Manage button) once it closes. If that was the banner and the
  // banner is gone (choice saved), focus stays where the browser puts it.
  useEffect(() => {
    if (consent.settingsOpen) return;
    const target = takeReturnFocusTarget();
    if (target?.isConnected) target.focus();
  }, [consent.settingsOpen]);

  const save = (analytics: boolean) => {
    saveConsent(analytics);
    setAnnouncement('Your choices are saved.');
  };

  return (
    <>
      {isConsentBannerVisible(consent) ? (
        <ConsentBanner
          zIndex={CONSENT_BANNER_Z_INDEX}
          onAcceptAll={() => save(true)}
          onRejectAll={() => save(false)}
          onManage={openCookieSettings}
        />
      ) : null}
      <ConsentPreferencesDialog
        open={consent.settingsOpen}
        analyticsEnabled={consent.analytics}
        onSave={save}
        onRejectAll={() => save(false)}
        onClose={closeCookieSettings}
      />
      {/* Plain aria-live="polite" (no role="status", no aria-atomic): pages'
          getByRole('status') loading indicators and the app-wide
          GlobalAnnouncer (polite + atomic) must stay uniquely addressable. */}
      <div
        aria-live="polite"
        data-testid="consent-announcer"
        style={visuallyHidden}
      >
        {announcement}
      </div>
    </>
  );
}

/**
 * "Cookie settings" link — a button that opens the Privacy choices panel
 * pre-filled with the current choice. Shown to every visitor (PO decision).
 */
export function CookieSettingsButton({
  children = 'Cookie settings',
  style,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={openCookieSettings}
      data-testid="cookie-settings-button"
      style={{
        background: 'none',
        border: 0,
        padding: 0,
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        textDecoration: 'underline',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
