import * as React from 'react';
import type { HeadlineVariant, Layout, Tweaks } from './types';

interface TweaksPanelProps {
  tweaks: Tweaks;
  setTweak: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;
  onClose: () => void;
}

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

export const TweaksPanel: React.FC<TweaksPanelProps> = ({
  tweaks,
  setTweak,
  onClose,
}) => (
  <aside className="ll-tweaks">
    <div className="ll-tweaks-head">
      <div>
        <div className="ll-tweaks-eyebrow">Tweaks</div>
        <div className="ll-tweaks-title">Login Page</div>
      </div>
      <button
        className="ll-tweaks-close"
        onClick={onClose}
        aria-label="Close tweaks"
      >
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
