import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  H4,
  Input,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { useUpdateCommissionerNoteMutation } from '../../api/db/graphql.generated';

export interface CommissionerNoteControlProps {
  leagueId: number;
  currentNote?: string | null;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

/**
 * CommissionerNoteControl - Manage a persistent note displayed to all league members.
 * Cross-platform: Tamagui only, no web-specific APIs.
 */
export function CommissionerNoteControl({
  leagueId,
  currentNote,
  onSuccess,
  onError,
}: CommissionerNoteControlProps) {
  const [note, setNote] = useState(currentNote ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNote(currentNote ?? '');
  }, [currentNote]);

  const [updateNote] = useUpdateCommissionerNoteMutation();

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updateNote({
        variables: { input: { leagueId, note: note.trim() || null } },
      });
      setSaving(false);
      if (result.data?.updateCommissionerNote?.success) {
        onSuccess?.('Commissioner note updated');
      } else {
        onError?.(
          new Error(
            result.data?.updateCommissionerNote?.message ??
              'Failed to update note',
          ),
        );
      }
    } catch (err) {
      setSaving(false);
      const error =
        err instanceof Error ? err : new Error('Failed to update note');
      LOGGER.error('Failed to update commissioner note', error);
      onError?.(error);
    }
  };

  return (
    <Card backgroundColor="$blue2" borderColor="$blue6" padding="$4">
      <YStack space="$3">
        <H4 color="$blue11">Commissioner Note</H4>
        <Text color="$gray11" fontSize="$3">
          This note is visible to all league members on the league page.
        </Text>
        <Input
          placeholder="Enter a message for your league..."
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
        />
        <XStack justifyContent="flex-end">
          <Button
            backgroundColor="$blue9"
            color="white"
            onPress={() => void handleSave()}
            disabled={saving}
            icon={saving ? <Spinner /> : undefined}
          >
            {saving ? 'Saving...' : 'Save Note'}
          </Button>
        </XStack>
      </YStack>
    </Card>
  );
}
