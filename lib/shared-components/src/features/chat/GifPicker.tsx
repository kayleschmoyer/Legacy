/**
 * GifPicker — Giphy-backed GIF search and selection component for league chat
 * and matchup chat.
 *
 * Calls the Giphy Search API with a G/PG rating filter.
 * The API key is passed in via the `giphyApiKey` prop so the component
 * is not coupled to any specific bundler environment (Vite, Metro, etc.).
 *
 * Usage:
 *   <GifPicker
 *     giphyApiKey={env.GIPHY_API_KEY}
 *     onSelect={(url) => void handleGif(url)}
 *     onClose={() => ...}
 *   />
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Spinner, Text, XStack, YStack } from 'tamagui';
import { ImageOff, Search, X } from '@tamagui/lucide-icons';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../utils/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyGif {
  id: string;
  title: string;
  images: {
    fixed_height_small: GiphyImage;
    original: GiphyImage;
    /** Giphy's recommended embed rendition — capped at 2 MB */
    downsized?: GiphyImage;
  };
}

interface GiphyResponse {
  data: GiphyGif[];
  meta: { status: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

function buildTrendingUrl(apiKey: string, rating: 'g' | 'pg' = 'g'): string {
  return `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=24&rating=${rating}`;
}

function buildSearchUrl(
  apiKey: string,
  query: string,
  rating: 'g' | 'pg',
): string {
  const encoded = encodeURIComponent(query.trim());
  return `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encoded}&limit=24&rating=${rating}&lang=en`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GifPickerProps {
  /** Giphy API key — required for search and trending endpoints. */
  giphyApiKey: string;
  /** Called when the user confirms a GIF selection — receives the original URL */
  onSelect: (gifUrl: string) => void;
  /** Called when the user dismisses the picker without selecting */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GifPicker({
  giphyApiKey,
  onSelect,
  onClose,
}: GifPickerProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [rating, setRating] = useState<'g' | 'pg'>('g');
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedGifIds, setFailedGifIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const fetchGifs = useCallback(async (url: string) => {
    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const id = ++requestIdRef.current;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Giphy API error: ${res.status}`);
      const json = (await res.json()) as GiphyResponse;
      // Only apply result if this is still the latest request
      if (id === requestIdRef.current) {
        setGifs(json.data ?? []);
        setFailedGifIds(new Set());
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (id !== requestIdRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to load GIFs';
      setError(msg);
    } finally {
      if (id === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Fetch trending on mount
  useEffect(() => {
    if (!giphyApiKey) {
      setError('Giphy API key is not configured.');
      return;
    }
    void fetchGifs(buildTrendingUrl(giphyApiKey, rating));
  }, [giphyApiKey, rating, fetchGifs]);

  // Debounced search when query or rating changes; also handles rating-only changes
  useEffect(() => {
    if (!giphyApiKey) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = query.trim();
      void fetchGifs(
        trimmed
          ? buildSearchUrl(giphyApiKey, trimmed, rating)
          : buildTrendingUrl(giphyApiKey, rating),
      );
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, rating, giphyApiKey, fetchGifs]);

  // Cleanup on unmount: cancel debounce timers and in-flight requests
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
  }, []);

  const handleImageError = useCallback((gifId: string) => {
    setFailedGifIds((prev) => new Set([...prev, gifId]));
  }, []);

  return (
    <YStack
      backgroundColor="$background"
      borderRadius="$4"
      borderWidth={1}
      borderColor="$borderColor"
      overflow="hidden"
      width="100%"
      elevation={8}
    >
      {/* Header */}
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderBottomWidth={1}
        borderBottomColor="$borderColor"
        alignItems="center"
        justifyContent="space-between"
      >
        <Text fontSize="$4" fontWeight="700" color="$color">
          GIF Search
        </Text>
        <XStack gap="$2" alignItems="center">
          {/* Content rating toggle */}
          <Button
            size="$2"
            backgroundColor={rating === 'g' ? '$brandNavyLight' : '$gray5'}
            color={rating === 'g' ? '$colorInverse' : '$color'}
            onPress={() => setRating('g')}
            paddingHorizontal="$2"
          >
            <Text
              fontSize="$2"
              fontWeight="600"
              color={rating === 'g' ? '$colorInverse' : '$color'}
            >
              G
            </Text>
          </Button>
          <Button
            size="$2"
            backgroundColor={rating === 'pg' ? '$brandNavyLight' : '$gray5'}
            color={rating === 'pg' ? '$colorInverse' : '$color'}
            onPress={() => setRating('pg')}
            paddingHorizontal="$2"
          >
            <Text
              fontSize="$2"
              fontWeight="600"
              color={rating === 'pg' ? '$colorInverse' : '$color'}
            >
              PG
            </Text>
          </Button>
          <Button
            size="$2"
            circular
            backgroundColor="transparent"
            onPress={onClose}
            aria-label="Close GIF picker"
          >
            <X size={16} color="$textMuted" />
          </Button>
        </XStack>
      </XStack>

      {/* Search input */}
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderBottomWidth={1}
        borderBottomColor="$borderColor"
        alignItems="center"
        gap="$2"
      >
        <Search size={16} color="$textMuted" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search GIFs\u2026"
          aria-label="Search GIFs"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 14,
            color: 'inherit',
            fontFamily: 'inherit',
          }}
        />
      </XStack>

      {/* GIF grid */}
      <div
        style={{
          overflowY: 'auto',
          maxHeight: 320,
          padding: '8px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
          gap: 6,
        }}
      >
        {loading && (
          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <Spinner size="small" color="$brandNavyLight" />
          </div>
        )}
        {!loading && error && (
          <div style={{ gridColumn: '1 / -1', padding: 16 }}>
            <Text fontSize="$2" color="$red10" textAlign="center">
              {error}
            </Text>
          </div>
        )}
        {!loading && !error && gifs.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: 16 }}>
            <Text fontSize="$2" color="$textMuted" textAlign="center">
              No GIFs found
            </Text>
          </div>
        )}
        {!loading &&
          !error &&
          gifs.map((gif) => {
            const thumb = gif.images.fixed_height_small;
            const failed = failedGifIds.has(gif.id);
            return (
              <button
                type="button"
                key={gif.id}
                disabled={failed}
                onClick={() => {
                  const url =
                    gif.images.downsized?.url ?? gif.images.original.url;
                  onSelect(url);
                }}
                style={{
                  border: '2px solid transparent',
                  borderRadius: 4,
                  padding: 0,
                  cursor: failed ? 'not-allowed' : 'pointer',
                  background: withAlpha('#000000', 0.15),
                  overflow: 'hidden',
                  aspectRatio: `${thumb.width}/${thumb.height}`,
                  outline: 'none',
                  transition: 'border-color 0.1s',
                  opacity: failed ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!failed)
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      BRAND_NAVY_LIGHT;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    'transparent';
                }}
                aria-label={
                  failed
                    ? `Image unavailable: ${gif.title}`
                    : `Send GIF: ${gif.title}`
                }
              >
                {failed ? (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      padding: 4,
                    }}
                  >
                    <ImageOff size={20} color="$textMuted" />
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--textMuted, #888)',
                        textAlign: 'center',
                        lineHeight: 1.2,
                      }}
                    >
                      Image unavailable
                    </span>
                  </div>
                ) : (
                  <img
                    src={thumb?.url ?? gif.images.original.url}
                    alt={gif.title}
                    loading="lazy"
                    onError={() => handleImageError(gif.id)}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                )}
              </button>
            );
          })}
      </div>

      {/* Footer */}
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderTopWidth={1}
        borderTopColor="$borderColor"
        justifyContent="space-between"
        alignItems="center"
      >
        <Text fontSize="$1" color="$textMuted">
          Powered by GIPHY \u00b7 {rating.toUpperCase()} rated \u00b7 click to
          send
        </Text>
        <Button
          size="$2"
          backgroundColor="$gray5"
          color="$color"
          onPress={onClose}
        >
          <Text fontSize="$2">Cancel</Text>
        </Button>
      </XStack>
    </YStack>
  );
}
