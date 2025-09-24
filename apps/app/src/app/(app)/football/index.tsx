import React from 'react';
import { ScrollView, Text } from 'tamagui';

export default function FootballHome() {
  return (
    <ScrollView
      contentContainerStyle={{
        alignItems: 'center',
        backgroundColor: '#121212',
        flexGrow: 1,
        padding: 20,
      }}
    >
      <Text color="$yellow10" fontSize="$8" fontWeight="bold" marginBottom="$3">
        Football Fantasy
      </Text>
      <Text color="$white" fontSize="$5" marginBottom="$6" textAlign="center">
        Manage your leagues and drafts
      </Text>

      <Text color="$white" fontSize="$7" fontWeight="600" marginBottom="$3">
        Upcoming Drafts
      </Text>
    </ScrollView>
  );
}
