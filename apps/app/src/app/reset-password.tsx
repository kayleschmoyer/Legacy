import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Input, Label, Paragraph, Text, Theme, YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';

/**
 * Reset-password screen — handles the /reset-password?token=... deep link.
 *
 * iOS Universal Links and Android App Links intercept the reset email's URL
 * (e.g. https://legacy-fantasy.com/reset-password?token=...) and open this
 * screen inside the native app instead of a browser. The token query param is
 * passed through unchanged by Expo Router's linking configuration.
 */
const ResetPasswordScreen: React.FC = () => {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // config.oauthProxy is nativeRequired: buildNativeConfig() throws at startup
  // if it is missing, so this is always defined by the time this screen renders.
  const oauthProxyUrl = config.oauthProxy ?? '';

  const handleSubmit = async () => {
    if (password.length < 12) {
      Alert.alert(
        'Password too short',
        'Password must be at least 12 characters.',
      );
      return;
    }
    if (password !== confirm) {
      Alert.alert(
        'Passwords do not match',
        'Please make sure both fields match.',
      );
      return;
    }
    if (!token) {
      Alert.alert(
        'Invalid link',
        'Reset token is missing. Please use the link from your email.',
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${oauthProxyUrl}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword: confirm }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ?? 'Reset failed. Please request a new link.',
        );
      }

      setDone(true);
    } catch (err) {
      LOGGER.error(
        'Reset-password failed',
        err instanceof Error ? err : String(err),
      );
      Alert.alert(
        'Reset failed',
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Theme name="legacy_dark">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <YStack
            flex={1}
            justifyContent="center"
            padding="$5"
            backgroundColor="#0A0F1A"
            gap="$4"
          >
            <YStack gap="$2">
              <Text
                fontFamily="$heading"
                fontSize={28}
                color="#E8DCC8"
                fontWeight="700"
              >
                Reset password
              </Text>
              {done ? (
                <Paragraph color="#B0B8C8" lineHeight={24}>
                  Your password has been updated. You can now sign in with your
                  new password.
                </Paragraph>
              ) : (
                <Paragraph color="#B0B8C8" lineHeight={24}>
                  Choose a new password — must be at least 12 characters.
                </Paragraph>
              )}
            </YStack>

            {done ? (
              <Button
                backgroundColor="#1B3A5C"
                color="#E8DCC8"
                onPress={() => router.replace('/login')}
              >
                Sign in
              </Button>
            ) : (
              <YStack gap="$3">
                <YStack gap="$1">
                  <Label color="#9CA3AF" htmlFor="password">
                    New password
                  </Label>
                  <Input
                    id="password"
                    secureTextEntry
                    placeholder="At least 12 characters"
                    value={password}
                    onChangeText={setPassword}
                    backgroundColor="#111B2F"
                    color="#E8DCC8"
                    borderColor="#1B3A5C"
                    placeholderTextColor="#4B5563"
                    editable={!isSubmitting}
                  />
                </YStack>

                <YStack gap="$1">
                  <Label color="#9CA3AF" htmlFor="confirm">
                    Confirm new password
                  </Label>
                  <Input
                    id="confirm"
                    secureTextEntry
                    placeholder="Repeat password"
                    value={confirm}
                    onChangeText={setConfirm}
                    backgroundColor="#111B2F"
                    color="#E8DCC8"
                    borderColor="#1B3A5C"
                    placeholderTextColor="#4B5563"
                    editable={!isSubmitting}
                  />
                </YStack>

                <Button
                  backgroundColor="#1B3A5C"
                  color="#E8DCC8"
                  onPress={() => {
                    void handleSubmit();
                  }}
                  disabled={isSubmitting}
                  opacity={isSubmitting ? 0.6 : 1}
                >
                  {isSubmitting ? 'Updating…' : 'Update password'}
                </Button>
              </YStack>
            )}
          </YStack>
        </ScrollView>
      </KeyboardAvoidingView>
    </Theme>
  );
};

export default ResetPasswordScreen;
