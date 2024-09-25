import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import RNPickerSelect from 'react-native-picker-select';

const FilterOptions = () => {
  const [position, setPosition] = useState('');

  return (
    <View style={styles.container}>
      <RNPickerSelect
        onValueChange={(value) => setPosition(value)}
        items={[
          { label: 'All Positions', value: '' },
          { label: 'Pitcher', value: 'P' },
          { label: 'Catcher', value: 'C' },
          { label: 'Outfielder', value: 'OF' },
        ]}
        placeholder={{ label: 'Select Position', value: '' }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
});

export default FilterOptions;
