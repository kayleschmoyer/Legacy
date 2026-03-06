/**
 * GifPicker — Giphy-backed GIF search and selection component for league chat
 * and matchup chat (LS-307).
 *
 * Calls the Giphy Search API with a G/PG rating filter.
 * Requires VITE_GIPHY_API_KEY to be set in the environment.
 *
 * Usage:
 *   <GifPicker onSelect={(url) => void handleGif(url)} onClose={() => ...} />
 *
 * LS-419: clicking a GIF now directly sends it (no two-step confirm).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Spinner, Text, XStack, YStack } from 'tamagui';
import { Search, X } from '@tamagui/lucide-icons';
import { BRAND_NAVY_LIGHT } from '../../constants/colors';

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
    downsized: GiphyImage;
  };
}

interface GiphyResponse {
  data: GiphyGif[];
  meta: { status: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GIPHY_API_KEY = (import.meta.env['VITE_GIPHY_API_KEY'] as string) ?? '';

const TRENDING_URL = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=g`;

function buildSearchUrl(query: string, rating: 'g' | 'pg'): string {
  const encoded = encodeURIComponent(query.trim());
  return `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encoded}&limit=24&rating=${rating}&lang=en`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GifPickerProps {
  /** Called when the user confirms a GIF selection — receives the original URL */
  onSelect: (gifUrl: string) => void;
  /** Called when the user dismisses the picker without selecting */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GifPicker({
  onSelect,
  onClose,
}: GifPickerProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [rating, setRating] = useState<'g' | 'pg'>('g');
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch trending on mount
  useEffect(() => {
    if (!GIPHY_API_KEY) {
      setError('VITE_GIPHY_API_KEY is not configured.');
      return;
    }
    void fetchGifs(TRENDING_URL);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time mount fetch, deps intentionally empty
  }, []);

  // Re-fetch when rating changes (respects the current query)
  useEffect(() => {
    if (!GIPHY_API_KEY) return;
    const trimmed = query.trim();
    void fetchGifs(trimmed ? buildSearchUrl(trimmed, rating) : TRENDING_URL);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch when rating changes
  }, [rating]);

  const fetchGifs = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Giphy API error: ${res.status}`);
      const json = (await res.json()) as GiphyResponse;
      setGifs(json.data ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load GIFs';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!GIPHY_API_KEY) return;
        const trimmed = value.trim();
        void fetchGifs(
          trimmed ? buildSearchUrl(trimmed, rating) : TRENDING_URL,
        );
      }, 400);
    },
    [fetchGifs, rating],
  );

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
            backgroundColor={rating === 'g' ? BRAND_NAVY_LIGHT : '$gray5'}
            color={rating === 'g' ? 'white' : '$color'}
            onPress={() => setRating('g')}
            paddingHorizontal="$2"
          >
            <Text
              fontSize="$2"
              fontWeight="600"
              color={rating === 'g' ? 'white' : '$color'}
            >
              G
            </Text>
          </Button>
          <Button
            size="$2"
            backgroundColor={rating === 'pg' ? BRAND_NAVY_LIGHT : '$gray5'}
            color={rating === 'pg' ? 'white' : '$color'}
            onPress={() => setRating('pg')}
            paddingHorizontal="$2"
          >
            <Text
              fontSize="$2"
              fontWeight="600"
              color={rating === 'pg' ? 'white' : '$color'}
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
            <X size={16} color="var(--textMuted, #888)" />
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
        <Search size={16} color="var(--textMuted, #888)" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search GIFs…"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 14,
            color: 'var(--color)',
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
            <Spinner size="small" color={BRAND_NAVY_LIGHT} />
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
            return (
              <button
                key={gif.id}
                onClick={() => {
                  const url =
                    gif.images.downsized?.url ?? gif.images.original.url;
                  onSelect(url);
                }}
                style={{
                  border: '2px solid transparent',
                  borderRadius: 4,
                  padding: 0,
                  cursor: 'pointer',
                  background: 'rgba(0,0,0,0.15)',
                  overflow: 'hidden',
                  // Use natural Giphy dimensions so portrait/square GIFs
                  // aren't letterboxed by a forced 16/9 crop.
                  aspectRatio: `${thumb.width}/${thumb.height}`,
                  outline: 'none',
                  transition: 'border-color 0.1s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    BRAND_NAVY_LIGHT;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    'transparent';
                }}
                aria-label={`Send GIF: ${gif.title}`}
              >
                <img
                  src={thumb?.url ?? gif.images.original.url}
                  alt={gif.title}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                />
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
          Powered by GIPHY · {rating.toUpperCase()} rated · click to send
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
