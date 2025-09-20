/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from '../../platform-components';
import { safeStyle } from '../../utils/styles';

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

  const chipStyle = [
    styles.filterChip,
    styles[`${variant}Chip`],
    styles[`${size}Chip`],
    isSelected && styles[`${variant}ChipActive`],
  ];

  const textStyle = [
    styles.filterChipText,
    styles[`${size}ChipText`],
    isSelected && styles[`${variant}ChipTextActive`],
  ];

  return (
    <Animated.View style={safeStyle({ transform: 'scale(1)' })}>
      <TouchableOpacity
        style={safeStyle(chipStyle)}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.8}
      >
        <Text style={safeStyle(textStyle)}>{label}</Text>
      </TouchableOpacity>
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

  const containerStyle = [
    styles.quickFiltersContainer,
    variant === 'grid' && styles.quickFiltersGrid,
  ];

  return (
    <View style={safeStyle(containerStyle)}>
      {visibleSections.map((section) => (
        <View key={section.key} style={styles.quickFilterSection}>
          <Text style={styles.quickFilterTitle}>{section.title}</Text>
          <ScrollView
            horizontal={variant === 'horizontal'}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={safeStyle([
              styles.quickFilterOptions,
              variant === 'grid' && styles.quickFilterOptionsGrid,
            ])}
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
          </ScrollView>
        </View>
      ))}
    </View>
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
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.drawerOverlay}>
        <TouchableOpacity
          style={styles.drawerBackdrop}
          onPress={onClose}
          activeOpacity={1}
        />
        <Animated.View
          style={safeStyle([
            styles.filterDrawer,
            variant === 'scale' && styles.scaleDrawer,
            // Skip animated style for web compatibility
          ])}
        >
          {/* Header */}
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.drawerContent}>
            {sections.map((section) => (
              <View key={section.key} style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>{section.title}</Text>
                <View style={styles.filterGrid}>
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
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Footer */}
          <View style={styles.drawerFooter}>
            <TouchableOpacity
              style={safeStyle([styles.drawerButton, styles.resetButton])}
              onPress={handleReset}
            >
              <Text style={styles.resetButtonText}>{resetLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={safeStyle([styles.drawerButton, styles.applyButton])}
              onPress={onClose}
            >
              <Text style={styles.applyButtonText}>{applyLabel}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Quick Filters
  quickFiltersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1a1a1a',
  },

  quickFiltersGrid: {
    flexDirection: 'column',
  },

  quickFilterSection: {
    marginBottom: 8,
  },

  quickFilterTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 6,
    marginLeft: 4,
  },

  quickFilterOptions: {
    flexDirection: 'row',
    gap: 8,
  },

  quickFilterOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  // Filter Chips
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },

  defaultChip: {
    backgroundColor: '#2a2a2a',
    borderColor: '#374151',
  },

  accentChip: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },

  outlineChip: {
    backgroundColor: 'transparent',
    borderColor: '#6b7280',
  },

  smallChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  mediumChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  largeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  defaultChipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },

  accentChipActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },

  outlineChipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },

  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#d1d5db',
  },

  smallChipText: {
    fontSize: 10,
  },

  mediumChipText: {
    fontSize: 12,
  },

  largeChipText: {
    fontSize: 14,
  },

  defaultChipTextActive: {
    color: '#ffffff',
  },

  accentChipTextActive: {
    color: '#ffffff',
  },

  outlineChipTextActive: {
    color: '#ffffff',
  },

  // Drawer
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },

  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  filterDrawer: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.8,
    minHeight: SCREEN_HEIGHT * 0.4,
  },

  scaleDrawer: {
    position: 'absolute',
    top: '10%',
    left: '5%',
    right: '5%',
    bottom: '10%',
    borderRadius: 20,
    maxHeight: 'none',
    minHeight: 'none',
  },

  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },

  drawerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },

  closeButton: {
    padding: 4,
  },

  closeButtonText: {
    fontSize: 18,
    color: '#9ca3af',
  },

  drawerContent: {
    flex: 1,
    paddingHorizontal: 20,
  },

  filterSection: {
    marginVertical: 16,
  },

  filterSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d1d5db',
    marginBottom: 12,
  },

  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  drawerFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },

  drawerButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  resetButton: {
    backgroundColor: '#374151',
  },

  applyButton: {
    backgroundColor: '#3b82f6',
  },

  resetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d1d5db',
  },

  applyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export { FilterChip };
export { QuickFilters };
export { FilterDrawer };
