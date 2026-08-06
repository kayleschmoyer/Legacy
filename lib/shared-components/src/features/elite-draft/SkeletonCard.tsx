import React, { useEffect, useState } from 'react';
import { YStack } from 'tamagui';
import { Skeleton } from '../../components/Skeleton';

// ---------------------------------------------------------------------------
// Skeleton Card (loading placeholder) — only consumed by LoadingScreen
// ---------------------------------------------------------------------------

export function SkeletonCard({ delay }: { delay: number }) {
  // Stagger each card's fade-in by `delay` seconds so the 9-card grid reads
  // as a cascade rather than popping in all at once.
  const [visible, setVisible] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;
    const timer = setTimeout(() => setVisible(true), delay * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <YStack
      backgroundColor="$surfacePanel"
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$5"
      padding="$4"
      gap="$2"
      animation="medium"
      opacity={visible ? 1 : 0}
    >
      <Skeleton width="55%" height={18} />
      <Skeleton width="35%" height={13} />
      <Skeleton width="100%" height={54} />
      <Skeleton width="100%" height={30} />
      <Skeleton width="100%" height={36} />
    </YStack>
  );
}
