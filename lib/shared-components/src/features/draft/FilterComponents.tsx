import React, { useEffect, useRef } from 'react';
import { Button, ScrollView, Sheet, Text, XStack, YStack } from 'tamagui';
import { Animated, Dimensions } from '../../platform-components';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface Filter {
  position?: string;
  team?: string;
  availability?: string;
  trending?: string;
  injury?: string;
  ownership?: string;
  sort?: string;
  [key: string]: string | undefined;
}

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterSection {
  key: string;
  title: string;
  options: FilterOption[];
  allowMultiple?: boolean;
}

export interface FilterDrawerProps {
  visible: boolean;
  onClose: () => void;
  filters: Filter;
  onFiltersChange: (filters: Filter) => void;
  sections: FilterSection[];
  title?: string;
  resetLabel?: string;
  applyLabel?: string;
  onReset?: () => void;
  variant?: 'slide' | 'fade' | 'scale';
}

export interface FilterChipProps {
  label: string;
  value: string;
  isSelected: boolean;
  onPress: () => void;
  variant?: 'default' | 'accent' | 'outline';
  size?: 'small' | 'medium' | 'large';
}

export interface QuickFiltersProps {
  filters: Filter;
  onFiltersChange: (filters: Filter) => void;
  sections: FilterSection[];
  maxVisible?: number;
  variant?: 'horizontal' | 'grid';
}

/**
 * Filter Chip Component
 */
function FilterChip({
  label,
  value,
  isSelected,
  onPress,
  variant = 'default',
  size = 'medium',
}: FilterChipProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const getChipProps = () => {
    const baseProps = {
      paddingHorizontal: size === 'small' ? 8 : size === 'medium' ? 12 : 16,
      paddingVertical: size === 'small' ? 4 : size === 'medium' ? 6 : 8,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    };

    const getVariantProps = () => {
      switch (variant) {
        case 'accent':
          return {
            backgroundColor: isSelected ? '$blue600' : '$blue500',
            borderColor: isSelected ? '$blue600' : '$blue500',
          };
        case 'outline':
          return {
            backgroundColor: isSelected ? '$blue500' : 'transparent',
            borderColor: isSelected ? '$blue500' : '$gray500',
          };
        default:
          return {
            backgroundColor: isSelected ? '$blue500' : '$gray800',
            borderColor: isSelected ? '$blue500' : '$gray600',
          };
      }
    };

    return { ...baseProps, ...getVariantProps() };
  };

  const getTextProps = () => {
    const baseProps = {
      fontSize: size === 'small' ? 10 : size === 'medium' ? 12 : 14,
      fontWeight: '500' as const,
    };

    const color = isSelected ? '$white' : '$gray300';

    return { ...baseProps, color };
  };

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
      }}
    >
      <Button
        {...getChipProps()}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        unstyled
      >
        <Text {...getTextProps()}>{label}</Text>
      </Button>
    </Animated.View>
  );
}

/**
 * Quick Filters Bar Component
 */
function QuickFilters({
  filters,
  onFiltersChange,
  sections,
  maxVisible = 1,
  variant = 'horizontal',
}: QuickFiltersProps) {
  const visibleSections = sections.slice(0, maxVisible);

  return (
    <YStack
      paddingHorizontal={16}
      paddingVertical={8}
      backgroundColor="$gray900"
      flexDirection={variant === 'grid' ? 'row' : undefined}
      flexWrap={variant === 'grid' ? 'wrap' : undefined}
    >
      {visibleSections.map((section) => (
        <YStack key={section.key} marginVertical={8}>
          <Text
            fontSize={12}
            fontWeight="600"
            color="$gray400"
            marginBottom={6}
            marginLeft={4}
          >
            {section.title}
          </Text>
          <ScrollView
            horizontal={variant === 'horizontal'}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <XStack
              gap={8}
              flexDirection="row"
              flexWrap={variant === 'grid' ? 'wrap' : undefined}
            >
              {section.options.map((option) => (
                <FilterChip
                  key={option.value}
                  label={option.label}
                  value={option.value}
                  isSelected={filters[section.key] === option.value}
                  onPress={() =>
                    onFiltersChange({
                      ...filters,
                      [section.key]:
                        filters[section.key] === option.value
                          ? undefined
                          : option.value,
                    })
                  }
                  size="small"
                />
              ))}
            </XStack>
          </ScrollView>
        </YStack>
      ))}
    </YStack>
  );
}

/**
 * Filter Drawer Component with smooth animations
 */
function FilterDrawer({
  visible,
  onClose,
  filters,
  onFiltersChange,
  sections,
  title = 'Filters',
  resetLabel = 'Reset',
  applyLabel = 'Apply',
  onReset,
  variant = 'slide',
}: FilterDrawerProps) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (variant === 'slide') {
      Animated.spring(slideAnim, {
        toValue: visible ? 0 : SCREEN_HEIGHT,
        useNativeDriver: true,
      }).start();
    } else if (variant === 'fade') {
      Animated.timing(fadeAnim, {
        toValue: visible ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (variant === 'scale') {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: visible ? 1 : 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: visible ? 1 : 0.8,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, variant, slideAnim, fadeAnim, scaleAnim]);

  const handleReset = () => {
    if (onReset) {
      onReset();
    } else {
      // Default reset behavior
      const resetFilters: Filter = {};
      sections.forEach((section) => {
        resetFilters[section.key] = undefined;
      });
      onFiltersChange(resetFilters);
    }
  };

  // Animation disabled for web compatibility
  // const getAnimatedStyle = () => {
  //   switch (variant) {
  //     case 'slide':
  //       return { transform: [{ translateY: slideAnim }] };
  //     case 'fade':
  //       return { opacity: fadeAnim };
  //     case 'scale':
  //       return {
  //         opacity: fadeAnim,
  //         transform: [{ scale: scaleAnim }],
  //       };
  //     default:
  //       return {};
  //   }
  // };

  if (!visible && variant !== 'slide') return null;

  return (
    <Sheet modal open={visible} onOpenChange={onClose} snapPointsMode="fit">
      <Sheet.Overlay />
      <Sheet.Frame backgroundColor="#1a1a1a" borderRadius={20}>
        <Sheet.Handle />
        <Animated.View
          style={[
            {
              backgroundColor: '#1a1a1a',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: SCREEN_HEIGHT * 0.8,
              minHeight: SCREEN_HEIGHT * 0.4,
            },
            variant === 'scale' && {
              position: 'absolute',
              top: '10%',
              left: '5%',
              right: '5%',
              bottom: '10%',
              borderRadius: 20,
              maxHeight: undefined,
              minHeight: undefined,
            },
          ]}
        >
          {/* Header */}
          <XStack
            justifyContent="space-between"
            alignItems="center"
            paddingHorizontal={20}
            paddingVertical={16}
            borderBottomWidth={1}
            borderBottomColor="$gray600"
          >
            <Text fontSize={18} fontWeight="bold" color="$white">
              {title}
            </Text>
            <Button
              padding={4}
              onPress={onClose}
              backgroundColor="transparent"
              unstyled
              aria-label="Close filters"
            >
              <Text fontSize={18} color="$gray400">
                ✕
              </Text>
            </Button>
          </XStack>

          {/* Content */}
          <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
            {sections.map((section) => (
              <YStack key={section.key} marginVertical={16}>
                <Text
                  fontSize={14}
                  fontWeight="600"
                  color="$gray300"
                  marginBottom={12}
                >
                  {section.title}
                </Text>
                <XStack flexDirection="row" flexWrap="wrap" gap={8}>
                  {section.options.map((option) => (
                    <FilterChip
                      key={option.value}
                      label={option.label}
                      value={option.value}
                      isSelected={filters[section.key] === option.value}
                      onPress={() =>
                        onFiltersChange({
                          ...filters,
                          [section.key]:
                            filters[section.key] === option.value
                              ? undefined
                              : option.value,
                        })
                      }
                      variant="outline"
                    />
                  ))}
                </XStack>
              </YStack>
            ))}
          </ScrollView>

          {/* Footer */}
          <XStack
            gap={12}
            padding={20}
            borderTopWidth={1}
            borderTopColor="$gray600"
          >
            <Button
              flex={1}
              paddingVertical={12}
              borderRadius={8}
              backgroundColor="$gray600"
              onPress={handleReset}
            >
              <Text fontSize={14} fontWeight="600" color="$gray300">
                {resetLabel}
              </Text>
            </Button>
            <Button
              flex={1}
              paddingVertical={12}
              borderRadius={8}
              backgroundColor="$blue500"
              onPress={onClose}
            >
              <Text fontSize={14} fontWeight="600" color="$white">
                {applyLabel}
              </Text>
            </Button>
          </XStack>
        </Animated.View>
      </Sheet.Frame>
    </Sheet>
  );
}

export { FilterChip };
export { QuickFilters };
export { FilterDrawer };
