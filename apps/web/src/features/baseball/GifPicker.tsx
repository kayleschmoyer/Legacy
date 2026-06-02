/**
 * GifPicker — web wrapper that injects the Giphy API key from app-config.
 */
import React from 'react';
import {
  GifPicker as SharedGifPicker,
  type GifPickerProps as SharedGifPickerProps,
} from '@legacy-sports/shared-components/chat';
import { env } from '../../config/environment';

// In E2E tests the Vite env var is empty (not set at build time).
// Allow runtime override via window.__e2eGiphyApiKey (same pattern as websocketUrl).
const GIPHY_API_KEY =
  typeof window !== 'undefined' &&
  navigator.webdriver === true &&
  typeof window.__e2eGiphyApiKey === 'string'
    ? window.__e2eGiphyApiKey
    : (env.giphyApiKey ?? '');

type GifPickerProps = Omit<SharedGifPickerProps, 'giphyApiKey'>;

export function GifPicker(props: GifPickerProps): React.JSX.Element {
  return <SharedGifPicker {...props} giphyApiKey={GIPHY_API_KEY} />;
}
