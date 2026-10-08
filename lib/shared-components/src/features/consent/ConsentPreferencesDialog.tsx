import React, { useEffect, useState } from 'react';
import { Switch, Text, XStack, YStack } from 'tamagui';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../Button';

export interface ConsentPreferencesDialogProps {
  open: boolean;
  /** Current analytics choice, used to pre-fill the switch on open. */
  analyticsEnabled: boolean;
  /** Save the switch state as the visitor's choice. */
  onSave: (analytics: boolean) => void;
  /** Reject analytics and save. */
  onRejectAll: () => void;
  /** Close (×, Esc, scrim) without changing anything. */
  onClose: () => void;
}

const ANALYTICS_DETAILS =
  'Google Analytics 4 (Google LLC): pages viewed, features used, approximate ' +
  'location, device and browser details, linked to a pseudonymous ID and, when ' +
  'signed in, your account ID. Deleted automatically when our retention period ' +
  'ends. Opt out here or with the Google ' +
  'Analytics opt-out add-on (tools.google.com/dlpage/gaoptout). GrowthBook: ' +
  'which version of a feature you were shown, sent to Google Analytics as an ' +
  'experiment event.';

function CategoryRow({
  id,
  name,
  description,
  control,
  children,
}: {
  id: string;
  name: string;
  description: string;
  control: React.ReactNode;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <YStack
      paddingVertical="$3"
      borderTopWidth={1}
      borderTopColor="$outlineSubtle"
      gap="$1"
    >
      <XStack alignItems="center" justifyContent="space-between" gap="$3">
        <YStack flex={1} gap="$1">
          <Text
            id={`${id}-name`}
            fontFamily="$body"
            fontSize={15}
            fontWeight="700"
            color="$color12"
          >
            {name}
          </Text>
          <Text
            id={`${id}-desc`}
            fontFamily="$body"
            fontSize={13}
            lineHeight={19}
            color="$textMuted"
          >
            {description}
          </Text>
        </YStack>
        <XStack
          minWidth={44}
          minHeight={44}
          alignItems="center"
          justifyContent="center"
        >
          {control}
        </XStack>
      </XStack>
      {children}
    </YStack>
  );
}

/**
 * "Privacy choices" panel (LS-10764). Opens from the banner's "Manage
 * choices" and from every "Cookie settings" link, pre-filled with the
 * current choice. Modal: focus is trapped and Esc closes without saving.
 */
export function ConsentPreferencesDialog({
  open,
  analyticsEnabled,
  onSave,
  onRejectAll,
  onClose,
}: ConsentPreferencesDialogProps): React.JSX.Element {
  const [analytics, setAnalytics] = useState(analyticsEnabled);
  const [showDetails, setShowDetails] = useState(false);

  // Re-sync the draft with the saved choice every time the panel opens.
  useEffect(() => {
    if (open) {
      setAnalytics(analyticsEnabled);
      setShowDetails(false);
    }
  }, [open, analyticsEnabled]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Privacy choices"
      description="Choose what we can use. You can change this any time from Cookie settings at the bottom of any page."
      confirmLabel="Save choices"
      cancelLabel="Reject all"
      onConfirm={() => onSave(analytics)}
      onCancel={onRejectAll}
    >
      <YStack data-testid="consent-preferences">
        <CategoryRow
          id="consent-necessary"
          name="Strictly necessary"
          description="Keeps you signed in, secures your account and remembers your settings. Always on."
          control={
            <Text fontFamily="$body" fontSize={13} color="$textMuted">
              Always on
            </Text>
          }
        />
        <CategoryRow
          id="consent-analytics"
          name="Analytics"
          description="Google Analytics 4 measures pages and features used, with a pseudonymous ID, so we can improve the game. GrowthBook records which version of a feature you saw."
          control={
            // Tamagui Switch directly (the design-system wrapper's props
            // type drops `checked`); styling mirrors ToggleControls' Switch.
            <Switch
              size="$3"
              width={42}
              height={24}
              backgroundColor="$surfaceCard"
              borderColor="$outlineStrong"
              borderWidth={1}
              $checked={{
                backgroundColor: '$brandNavy',
                borderColor: '$brandNavyLight',
              }}
              checked={analytics}
              onCheckedChange={setAnalytics}
              aria-labelledby="consent-analytics-name"
              aria-describedby="consent-analytics-desc"
              data-testid="consent-analytics-switch"
            >
              <Switch.Thumb
                animation="quick"
                backgroundColor="white"
                $checked={{ backgroundColor: '$brandGold' }}
              />
            </Switch>
          }
        >
          <Button
            variant="ghost"
            alignSelf="flex-start"
            paddingHorizontal={0}
            aria-expanded={showDetails}
            onPress={() => setShowDetails((v) => !v)}
          >
            <Text
              fontFamily="$body"
              fontSize={13}
              color="$color12"
              textDecorationLine="underline"
            >
              What&apos;s collected
            </Text>
          </Button>
          {showDetails ? (
            <Text
              fontFamily="$body"
              fontSize={13}
              lineHeight={19}
              color="$textMuted"
            >
              {ANALYTICS_DETAILS}
            </Text>
          ) : null}
        </CategoryRow>
      </YStack>
    </Dialog>
  );
}
