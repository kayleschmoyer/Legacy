import React from 'react';
import { Sheet as TamaguiSheet, Text, YStack } from 'tamagui';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** Snap-points as percentages of viewport. Defaults to [50, 90]. */
  snapPoints?: number[];
  children?: React.ReactNode;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

/**
 * Bottom sheet — used for mobile filter pickers and contextual actions.
 * Drag handle, optional title, full-bleed body. Snap points default to
 * half-height + near-full-screen.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  snapPoints = [50, 90],
  children,
}: SheetProps): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const animation = reducedMotion ? '100ms' : 'medium';

  return (
    <TamaguiSheet
      modal
      open={open}
      onOpenChange={onOpenChange}
      snapPointsMode="percent"
      snapPoints={snapPoints}
      dismissOnSnapToBottom
      animation={animation}
    >
      <TamaguiSheet.Overlay
        animation={animation}
        backgroundColor="rgba(8, 12, 20, 0.55)"
        style={{ backdropFilter: 'blur(4px)' } as never}
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      />
      <TamaguiSheet.Frame
        backgroundColor="$surfacePanel"
        borderTopWidth={1}
        borderTopColor="$surfacePanelBorder"
        borderTopLeftRadius={20}
        borderTopRightRadius={20}
        shadowColor="rgba(8, 12, 20, 0.75)"
        shadowOffset={{ width: 0, height: 20 }}
        shadowRadius={48}
        paddingTop={18}
        paddingHorizontal={20}
        paddingBottom={28}
        gap={14}
      >
        <TamaguiSheet.Handle
          width={40}
          height={4}
          backgroundColor="$outlineStrong"
          alignSelf="center"
          marginBottom={6}
        />
        {title ? (
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={20}
            color="$color12"
          >
            {title}
          </Text>
        ) : null}
        <YStack flex={1} gap={14}>
          {children}
        </YStack>
      </TamaguiSheet.Frame>
    </TamaguiSheet>
  );
}
