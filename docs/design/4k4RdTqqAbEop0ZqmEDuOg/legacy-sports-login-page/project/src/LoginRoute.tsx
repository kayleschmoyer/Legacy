// LoginRoute.tsx — drop-in route component for the Legacy Sports SPA.
//
// Usage (React Router v6):
//   <Route path="/login" element={<LoginRoute onAuthenticated={handleAuth} />} />
//
// Styling: import "./LoginRoute.css" (or the bundled login.css) once in your app shell.
// Fonts & color tokens come from the Legacy Sports design system
// (colors_and_type.css). Make sure that is loaded globally.

import * as React from 'react';
import type { LoginRouteProps, Provider, Tweaks } from './types';
import { HEADLINES } from './headlines';
import { BrandPane } from './BrandPane';
import { OAuthButtons } from './OAuthButtons';
import { TweaksPanel } from './TweaksPanel';
import { SecureIcon } from './icons';

const DEFAULT_TWEAKS: Tweaks = /*EDITMODE-BEGIN*/ {
  headlineVariant: 'dynasty',
  layout: 'split-right',
  showStatStrip: true,
  showMarquee: true,
}; /*EDITMODE-END*/

const LoginRoute: React.FC<LoginRouteProps> = ({
  onAuthenticated,
  signupHref = '/signup',
  defaultHeadlineVariant,
  defaultLayout,
}) => {
  const [tweaks, setTweaks] = React.useState<Tweaks>({
    ...DEFAULT_TWEAKS,
    ...(defaultHeadlineVariant
      ? { headlineVariant: defaultHeadlineVariant }
      : {}),
    ...(defaultLayout ? { layout: defaultLayout } : {}),
  });
  const [loading, setLoading] = React.useState<Provider | null>(null);
  const [tweaksOpen, setTweaksOpen] = React.useState<boolean>(false);

  const headline = HEADLINES[tweaks.headlineVariant] ?? HEADLINES.dynasty;

  // Tweaks bridge — only active when embedded in the design host
  React.useEffect(() => {
    const onMsg = (e: MessageEvent): void => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    }
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const setTweak = <K extends keyof Tweaks>(key: K, value: Tweaks[K]): void => {
    setTweaks((t) => ({ ...t, [key]: value }));
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: '__edit_mode_set_keys', edits: { [key]: value } },
        '*',
      );
    }
  };

  const handleOAuth = (provider: Provider): void => {
    if (loading) return;
    setLoading(provider);
    // Consumers swap this for a real redirect / popup; we simulate latency here.
    window.setTimeout(() => {
      setLoading(null);
      onAuthenticated?.(provider);
    }, 1800);
  };

  const layoutClass =
    tweaks.layout === 'split-left'
      ? 'll-shell ll-swap'
      : tweaks.layout === 'centered'
        ? 'll-shell ll-centered'
        : 'll-shell';

  return (
    <div className="ll-root" data-screen-label="Login">
      <header className="ll-nav">
        <div className="ll-nav-inner">
          <a className="ll-brand" href="/">
            <img src="ds/logo.png" alt="Legacy Sports" />
            <div className="ll-wordmark">
              LEGACY SPORTS
              <br />
              <span>FANTASY · YEAR-ROUND</span>
            </div>
          </a>
          <div className="ll-nav-right">
            <span className="ll-meta ll-nav-meta">
              New to Legacy?{' '}
              <a href={signupHref} className="ll-link-gold">
                Create an account
              </a>
            </span>
          </div>
        </div>
      </header>

      <main className={layoutClass}>
        {tweaks.layout !== 'centered' && (
          <BrandPane
            headline={headline}
            showStatStrip={tweaks.showStatStrip}
            showMarquee={tweaks.showMarquee}
          />
        )}

        <section className="ll-card-pane">
          <div className="ll-card">
            <div className="ll-card-head">
              <div className="ll-eyebrow ll-eyebrow-center">Sign In</div>
              <h2 className="ll-card-title">Step up to the plate</h2>
              <p className="ll-card-sub">Use the account you already trust.</p>
            </div>

            <OAuthButtons loading={loading} onSelect={handleOAuth} />

            <div className="ll-legal">
              By continuing, you agree to our{' '}
              <a href="/terms">Terms of Service</a> and{' '}
              <a href="/privacy">Privacy Policy</a>.
            </div>
          </div>

          <div className="ll-card-footer">
            <div className="ll-footer-item">
              <SecureIcon />
              <span>Trusted sign-in · Your account stays secure</span>
            </div>
            <div className="ll-footer-sep">·</div>
            <div className="ll-footer-item">
              <span>Free to play · No credit card</span>
            </div>
          </div>
        </section>
      </main>

      {tweaksOpen && (
        <TweaksPanel
          tweaks={tweaks}
          setTweak={setTweak}
          onClose={() => setTweaksOpen(false)}
        />
      )}
    </div>
  );
};

export default LoginRoute;
export { LoginRoute };
