// Preview bundle — concatenated source for Babel-standalone preview.
// The real SPA consumes src/LoginRoute.tsx (with proper imports).

const { useState, useEffect } = React;

type HeadlineVariant = 'dynasty' | 'dugout' | 'history';
type Layout = 'split-right' | 'split-left' | 'centered';
type Provider = 'google' | 'discord';
interface Tweaks {
  headlineVariant: HeadlineVariant;
  layout: Layout;
  showStatStrip: boolean;
  showMarquee: boolean;
}
interface Headline {
  eyebrow: string;
  h1a: string;
  h1b: string;
  lede: string;
}
interface LoginRouteProps {
  onAuthenticated?: (p: Provider) => void;
  signupHref?: string;
  defaultHeadlineVariant?: HeadlineVariant;
  defaultLayout?: Layout;
}

const HEADLINES: Record<HeadlineVariant, Headline> = {
  dynasty: {
    eyebrow: 'Members Clubhouse',
    h1a: 'Take the field.',
    h1b: 'Claim your dynasty.',
    lede: 'Sign in to manage your rosters, draft legends across every era, and see how your lineup stacked up this week.',
  },
  dugout: {
    eyebrow: 'Clubhouse Entry',
    h1a: 'Welcome back,',
    h1b: 'Commissioner.',
    lede: 'Your league is waiting. Sign in to check the scoreboard, approve trades, and set your lineup before first pitch.',
  },
  history: {
    eyebrow: 'One Login · Every Era',
    h1a: 'Every legend.',
    h1b: 'One lineup.',
    lede: 'From 1876 to this afternoon — sign in to draft across a century and a half of archived baseball statistics.',
  },
};

const GoogleG: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#FFC107"
      d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
    />
    <path
      fill="#FF3D00"
      d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C41 35 44 30 44 24c0-1.3-.1-2.3-.4-3.5z"
    />
  </svg>
);
const DiscordMark: React.FC = () => (
  <svg width="20" height="16" viewBox="0 0 71 55" aria-hidden="true">
    <path
      fill="#fff"
      d="M60.1 4.9A58.5 58.5 0 0 0 45.4.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A37.5 37.5 0 0 0 25.4.5a.2.2 0 0 0-.2-.1 58.4 58.4 0 0 0-14.7 4.5.2.2 0 0 0-.1.1C1.2 18.7-1.4 32.1.1 45.3a.2.2 0 0 0 .1.2 58.9 58.9 0 0 0 17.7 9 .2.2 0 0 0 .3-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.8 38.8 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.8a.2.2 0 0 1 .2 0 42 42 0 0 0 35.6 0 .2.2 0 0 1 .2 0l1.1.8a.2.2 0 0 1 0 .4 36.4 36.4 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47 47 0 0 0 3.6 5.9.2.2 0 0 0 .3.1 58.7 58.7 0 0 0 17.7-9 .2.2 0 0 0 .1-.2c1.8-15.3-2.3-28.6-9.8-40.3a.2.2 0 0 0-.1-.1zM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.1 0-4 2.8-7.2 6.4-7.2 3.6 0 6.5 3.2 6.4 7.2 0 3.9-2.8 7.1-6.4 7.1zm23.6 0c-3.5 0-6.4-3.2-6.4-7.1 0-4 2.8-7.2 6.4-7.2 3.6 0 6.5 3.2 6.4 7.2 0 3.9-2.8 7.1-6.4 7.1z"
    />
  </svg>
);
const SecureIcon: React.FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M16 3 6 7v9c0 6.1 4.3 11.5 10 13 5.7-1.5 10-6.9 10-13V7l-10-4z" />
    <path d="m11 16 3.5 3.5L21 13" stroke="#C5A55A" />
  </svg>
);
const StadiumArcs: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg
    viewBox="0 0 800 600"
    preserveAspectRatio="xMidYMid slice"
    style={style}
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="ll-lamp" cx="50%" cy="110%" r="75%">
        <stop offset="0%" stopColor="#C5A55A" stopOpacity="0.16" />
        <stop offset="40%" stopColor="#1B3A5C" stopOpacity="0.10" />
        <stop offset="100%" stopColor="#0A0F1A" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="ll-arc-stroke" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2C4A7C" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#2C4A7C" stopOpacity="0.05" />
      </linearGradient>
    </defs>
    <rect width="800" height="600" fill="url(#ll-lamp)" />
    <g fill="none" stroke="url(#ll-arc-stroke)" strokeWidth="1">
      <path d="M -200 900 A 760 760 0 0 1 1000 900" />
      <path d="M -140 900 A 680 680 0 0 1 940 900" />
      <path d="M -80 900 A 600 600 0 0 1 880 900" />
      <path d="M -20 900 A 520 520 0 0 1 820 900" />
      <path d="M 40 900 A 440 440 0 0 1 760 900" />
    </g>
    <path
      d="M -80 860 A 600 600 0 0 1 880 860"
      fill="none"
      stroke="#C41E3A"
      strokeOpacity="0.45"
      strokeWidth="1.5"
      strokeDasharray="2 10"
      strokeLinecap="round"
    />
  </svg>
);

const OAuthButtons: React.FC<{
  loading: Provider | null;
  onSelect: (p: Provider) => void;
}> = ({ loading, onSelect }) => (
  <div className="ll-oauth-list">
    <button
      type="button"
      className="ll-oauth ll-oauth-google"
      onClick={() => onSelect('google')}
      disabled={loading !== null}
      aria-label="Continue with Google"
    >
      <span className="ll-oauth-icon">
        <GoogleG />
      </span>
      <span className="ll-oauth-label">
        {loading === 'google'
          ? 'Connecting to Google…'
          : 'Continue with Google'}
      </span>
      {loading === 'google' && (
        <span className="ll-spinner" aria-hidden="true" />
      )}
    </button>
    <button
      type="button"
      className="ll-oauth ll-oauth-discord"
      onClick={() => onSelect('discord')}
      disabled={loading !== null}
      aria-label="Continue with Discord"
    >
      <span className="ll-oauth-icon">
        <DiscordMark />
      </span>
      <span className="ll-oauth-label">
        {loading === 'discord'
          ? 'Connecting to Discord…'
          : 'Continue with Discord'}
      </span>
      {loading === 'discord' && (
        <span className="ll-spinner" aria-hidden="true" />
      )}
    </button>
  </div>
);

const BrandPane: React.FC<{
  headline: Headline;
  showStatStrip: boolean;
  showMarquee: boolean;
}> = ({ headline, showStatStrip, showMarquee }) => (
  <section className="ll-cta-pane">
    <div className="ll-cta-inner">
      <div className="ll-eyebrow">
        <span className="ll-dot-gold" />
        {headline.eyebrow}
      </div>
      <h1 className="ll-h1">
        {headline.h1a}
        <br />
        <span className="ll-h1-accent">{headline.h1b}</span>
      </h1>
      <p className="ll-lede">{headline.lede}</p>
      {showStatStrip && (
        <div className="ll-stat-strip">
          <div className="ll-stat-cell">
            <div className="ll-stat-num">1876</div>
            <div className="ll-stat-lbl">First season on record</div>
          </div>
          <div className="ll-stat-divider" />
          <div className="ll-stat-cell">
            <div className="ll-stat-num">22,184</div>
            <div className="ll-stat-lbl">Players across every era</div>
          </div>
          <div className="ll-stat-divider" />
          <div className="ll-stat-cell">
            <div className="ll-stat-num ll-stat-num-gold">∞</div>
            <div className="ll-stat-lbl">Year-round leagues</div>
          </div>
        </div>
      )}
      {showMarquee && (
        <div className="ll-marquee">
          <div className="ll-marquee-label">Last night's ledger</div>
          <div className="ll-marquee-row">
            <span className="ll-mq-team">
              RUTH <span className="ll-mq-score">3-5</span>{' '}
              <span className="ll-mq-stat">2 HR · 5 RBI</span>
            </span>
            <span className="ll-mq-sep">·</span>
            <span className="ll-mq-team">
              MAYS <span className="ll-mq-score">2-4</span>{' '}
              <span className="ll-mq-stat">2B · SB</span>
            </span>
            <span className="ll-mq-sep">·</span>
            <span className="ll-mq-team">
              GIBSON <span className="ll-mq-score">7 IP</span>{' '}
              <span className="ll-mq-stat">9 K · 0 ER</span>
            </span>
            <span className="ll-mq-sep">·</span>
            <span className="ll-mq-team">
              TROUT <span className="ll-mq-score">1-3</span>{' '}
              <span className="ll-mq-stat">BB · R</span>
            </span>
          </div>
        </div>
      )}
    </div>
  </section>
);

const HEADLINE_OPTS: [HeadlineVariant, string][] = [
  ['dynasty', 'Take the field'],
  ['dugout', 'Welcome back'],
  ['history', 'Every legend'],
];
const LAYOUT_OPTS: [Layout, string][] = [
  ['split-right', 'CTA left'],
  ['split-left', 'CTA right'],
  ['centered', 'Centered'],
];
const TweaksPanel: React.FC<{
  tweaks: Tweaks;
  setTweak: <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => void;
  onClose: () => void;
}> = ({ tweaks, setTweak, onClose }) => (
  <aside className="ll-tweaks">
    <div className="ll-tweaks-head">
      <div>
        <div className="ll-tweaks-eyebrow">Tweaks</div>
        <div className="ll-tweaks-title">Login Page</div>
      </div>
      <button className="ll-tweaks-close" onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>
    <div className="ll-tweaks-group">
      <div className="ll-tweaks-label">Headline</div>
      <div className="ll-tweaks-opts">
        {HEADLINE_OPTS.map(([val, label]) => (
          <button
            key={val}
            className={`ll-tweaks-opt ${tweaks.headlineVariant === val ? 'on' : ''}`}
            onClick={() => setTweak('headlineVariant', val)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
    <div className="ll-tweaks-group">
      <div className="ll-tweaks-label">Layout</div>
      <div className="ll-tweaks-opts">
        {LAYOUT_OPTS.map(([val, label]) => (
          <button
            key={val}
            className={`ll-tweaks-opt ${tweaks.layout === val ? 'on' : ''}`}
            onClick={() => setTweak('layout', val)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
    <div className="ll-tweaks-group">
      <div className="ll-tweaks-label">Brand Panel</div>
      <label className="ll-tweaks-toggle">
        <input
          type="checkbox"
          checked={tweaks.showStatStrip}
          onChange={(e) => setTweak('showStatStrip', e.target.checked)}
        />
        <span>Stat strip</span>
      </label>
      <label className="ll-tweaks-toggle">
        <input
          type="checkbox"
          checked={tweaks.showMarquee}
          onChange={(e) => setTweak('showMarquee', e.target.checked)}
        />
        <span>Ledger marquee</span>
      </label>
    </div>
  </aside>
);

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
  const [tweaks, setTweaks] = useState<Tweaks>({
    ...DEFAULT_TWEAKS,
    ...(defaultHeadlineVariant
      ? { headlineVariant: defaultHeadlineVariant }
      : {}),
    ...(defaultLayout ? { layout: defaultLayout } : {}),
  });
  const [loading, setLoading] = useState<Provider | null>(null);
  const [tweaksOpen, setTweaksOpen] = useState<boolean>(false);
  const headline = HEADLINES[tweaks.headlineVariant] ?? HEADLINES.dynasty;

  useEffect(() => {
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

(window as any).LoginRoute = LoginRoute;
