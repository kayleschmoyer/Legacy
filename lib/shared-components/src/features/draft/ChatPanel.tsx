import React, { useState } from 'react';
import { Button, Input, ScrollView, Text, XStack, YStack } from 'tamagui';

interface Message {
  text: string;
  user: string;
}

interface ChatPanelProps {
  onClose: () => void;
  leagueId: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  onClose,
  leagueId: _leagueId,
}) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);

  const sendMessage = () => {
    setMessages((prev) => [...prev, { text: message, user: 'You' }]);
    setMessage('');
  };

  return (
    <YStack
      flex={1}
      padding="$4"
      backgroundColor="$background"
      borderRadius="$4"
    >
      <XStack
        justifyContent="space-between"
        alignItems="center"
        marginBottom="$2"
      >
        <Text fontSize="$6" fontWeight="bold">
          League Chat
        </Text>
        <Button size="$2" onPress={onClose}>
          <Text>X</Text>
        </Button>
      </XStack>
      <ScrollView flex={1}>
        {messages.map((msg, index) => (
          <Text key={index}>
            {msg.user}: {msg.text}
          </Text>
        ))}
      </ScrollView>
      <XStack space="$2">
        <Input
          flex={1}
          value={message}
          onChangeText={setMessage}
          placeholder="Type message..."
        />
        <Button onPress={sendMessage}>
          <Text>Send</Text>
        </Button>
      </XStack>
    </YStack>
  );
};
