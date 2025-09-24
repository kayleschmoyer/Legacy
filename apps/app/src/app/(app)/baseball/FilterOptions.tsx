import React, { useState } from 'react';
import { YStack } from 'tamagui';
import RNPickerSelect from 'react-native-picker-select';

const FilterOptions = () => {
  const [position, setPosition] = useState('');

  return (
    <YStack marginBottom="$5">
      <RNPickerSelect
        onValueChange={(value: string) => setPosition(value)}
        value={position}
        items={[
          { label: 'All Positions', value: '' },
          { label: 'Pitcher', value: 'P' },
          { label: 'Catcher', value: 'C' },
          { label: 'Outfielder', value: 'OF' },
        ]}
        placeholder={{ label: 'Select Position', value: '' }}
      />
    </YStack>
  );
};

export default FilterOptions;
