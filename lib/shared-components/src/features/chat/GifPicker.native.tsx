/**
 * GifPicker — React Native implementation.
 *
 * Uses Giphy Search & Trending APIs with a FlatList grid display.
 * Same props interface as the web version.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Button, Spinner, Text, XStack, YStack } from 'tamagui';
import { Search, X } from '@tamagui/lucide-icons';

import type { GifPickerProps } from './GifPicker';

export type { GifPickerProps };

// ---------------------------------------------------------------------------
// Giphy Types
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
    downsized?: GiphyImage;
  };
}

interface GiphyResponse {
  data: GiphyGif[];
  meta: { status: number };
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function buildTrendingUrl(apiKey: string, rating: 'g' | 'pg' = 'g'): string {
  return `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=24&rating=${rating}`;
}

function buildSearchUrl(
  apiKey: string,
  query: string,
  rating: 'g' | 'pg' = 'g',
): string {
  return `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=24&rating=${rating}`;
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
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchGifs = useCallback(
    async (searchQuery: string) => {
      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const id = ++requestIdRef.current;

      setLoading(true);
      try {
        const url = searchQuery.trim()
          ? buildSearchUrl(giphyApiKey, searchQuery)
          : buildTrendingUrl(giphyApiKey);
        const res = await fetch(url, { signal: controller.signal });
        const json = (await res.json()) as GiphyResponse;
        // Only apply if this is still the latest request and component is mounted
        if (
          id === requestIdRef.current &&
          isMountedRef.current &&
          json.meta.status === 200
        ) {
          setGifs(json.data);
        }
      } catch {
        // Silently fail — user can retry (includes AbortError)
      } finally {
        if (id === requestIdRef.current && isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [giphyApiKey],
  );

  // Debounced search (also handles initial trending load when query is '')
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchGifs(query);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchGifs]);

  const handleSelect = useCallback(
    (gif: GiphyGif) => {
      const url = gif.images.downsized?.url ?? gif.images.original.url;
      onSelect(url);
    },
    [onSelect],
  );

  return (
    <YStack
      backgroundColor="$background"
      borderTopWidth={1}
      borderTopColor="$gray4"
      maxHeight={360}
    >
      {/* Header */}
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        alignItems="center"
        gap="$2"
      >
        <Search size={16} color="$gray10" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search GIFs..."
          placeholderTextColor="#9CAAC5"
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
        <Button
          size="$2"
          chromeless
          onPress={onClose}
          icon={<X size={16} color="$gray10" />}
        />
      </XStack>

      {/* Grid */}
      {loading && gifs.length === 0 ? (
        <YStack padding="$4" alignItems="center">
          <Spinner />
        </YStack>
      ) : (
        <FlatList
          data={gifs}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Pressable
              style={styles.gifCell}
              onPress={() => handleSelect(item)}
            >
              <Image
                source={{ uri: item.images.fixed_height_small.url }}
                style={styles.gifImage}
                resizeMode="cover"
              />
            </Pressable>
          )}
          ListEmptyComponent={
            <YStack padding="$4" alignItems="center">
              <Text color="$gray10" fontSize="$3">
                {loading
                  ? 'Loading...'
                  : query
                    ? 'No GIFs found'
                    : 'No GIFs available'}
              </Text>
            </YStack>
          }
        />
      )}

      {/* Giphy attribution */}
      <XStack justifyContent="center" paddingVertical="$1">
        <Text fontSize={9} color="$gray8">
          Powered by GIPHY
        </Text>
      </XStack>
    </YStack>
  );
}

const styles = StyleSheet.create({
  searchInput: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2F3B53',
    backgroundColor: '#111B2F',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#F8FAFC',
  },
  grid: {
    paddingHorizontal: 4,
  },
  gifCell: {
    flex: 1 / 3,
    aspectRatio: 1,
    padding: 2,
  },
  gifImage: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
});
