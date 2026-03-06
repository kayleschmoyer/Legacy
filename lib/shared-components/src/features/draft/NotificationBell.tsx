import React from 'react';
import { Button } from 'tamagui';
import { Badge } from '@tamagui/lucide-icons';

interface Update {
  type: string;
  data: Record<string, unknown>;
}

interface NotificationBellProps {
  updates: Update[];
  settings: { sound: boolean; vibration: boolean };
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  updates,
  settings: _settings,
}) => {
  return (
    <Button size="$3" position="relative">
      <span role="img" aria-label="notifications">
        🔔
      </span>
      {updates.length > 0 && (
        <Badge position="absolute" top={-5} right={-5}>
          {updates.length}
        </Badge>
      )}
    </Button>
  );
};
