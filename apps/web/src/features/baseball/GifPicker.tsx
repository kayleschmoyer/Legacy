/**
 * GifPicker — web wrapper that injects the Giphy API key from Vite env.
 */
import React from 'react';
import {
  GifPicker as SharedGifPicker,
  type GifPickerProps as SharedGifPickerProps,
} from '@legacy-sports/shared-components/chat';

const GIPHY_API_KEY = (import.meta.env['VITE_GIPHY_API_KEY'] as string) ?? '';

type GifPickerProps = Omit<SharedGifPickerProps, 'giphyApiKey'>;

export function GifPicker(props: GifPickerProps): React.JSX.Element {
  return <SharedGifPicker {...props} giphyApiKey={GIPHY_API_KEY} />;
}
