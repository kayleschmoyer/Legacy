import React from 'react';
import { Button } from 'tamagui';

interface AccessibilitySettingsProps {
  mode: boolean;
  onChange: (mode: boolean) => void;
}

export const AccessibilitySettings: React.FC<AccessibilitySettingsProps> = ({ mode, onChange }) => {
  return (
    <Button size="$3" onPress={() => onChange(!mode)}>
      {mode ? 'Disable' : 'Enable'} Accessibility
    </Button>
  );
};
