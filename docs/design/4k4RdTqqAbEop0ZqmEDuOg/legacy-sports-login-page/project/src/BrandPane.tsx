import * as React from 'react';
import type { Headline } from './types';

interface BrandPaneProps {
  headline: Headline;
  showStatStrip: boolean;
  showMarquee: boolean;
}

export const BrandPane: React.FC<BrandPaneProps> = ({
  headline,
  showStatStrip,
  showMarquee,
}) => (
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
