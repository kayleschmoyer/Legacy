import * as React from 'react';
import type { Provider } from './types';
import { GoogleG, DiscordMark } from './icons';

interface OAuthButtonsProps {
  loading: Provider | null;
  onSelect: (provider: Provider) => void;
}

export const OAuthButtons: React.FC<OAuthButtonsProps> = ({
  loading,
  onSelect,
}) => (
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
