import React, { useEffect, useMemo, useState } from 'react';
import { Button, Paragraph, Spinner, XStack, YStack } from 'tamagui';
import { AlertTriangle } from '@tamagui/lucide-icons/icons/AlertTriangle';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { LOGGER } from '@legacy-sports/logging';
import {
  useCreateSetupIntentMutation,
  useRetryLatestInvoiceMutation,
} from '@legacy-sports/graphql';
import {
  AMBER,
  BG_DARK,
  BRAND_NAVY,
  RED,
  withAlpha,
} from '../../constants/colors';

export interface PaymentRecoveryModalProps {
  /** Called after the failed invoice has been paid with the new method. */
  onSuccess: () => void;
  /** Called when the user dismisses the modal without paying. */
  onDismiss: () => void;
  /** Fallback: open the hosted Stripe billing portal instead. */
  onUsePortal: () => void;
}

const GENERIC_ERROR = 'Something went wrong. Please try again.';

function PaymentForm({
  onSuccess,
  onUsePortal,
  onDismiss,
}: PaymentRecoveryModalProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [retryLatestInvoice] = useRetryLatestInvoiceMutation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once Stripe has accepted the new payment method we must not confirm again
  // on a retry — only the invoice payment needs another attempt.
  const [confirmedSetupIntentId, setConfirmedSetupIntentId] = useState<
    string | null
  >(null);

  const handleSubmit = async () => {
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      let setupIntentId = confirmedSetupIntentId;
      if (!setupIntentId) {
        const result = await stripe.confirmSetup({
          elements,
          redirect: 'if_required',
        });
        if (result.error) {
          setError(result.error.message ?? GENERIC_ERROR);
          return;
        }
        setupIntentId = result.setupIntent.id;
        setConfirmedSetupIntentId(setupIntentId);
      }

      const retry = await retryLatestInvoice({ variables: { setupIntentId } });
      const outcome = retry.data?.retryLatestInvoice;
      if (outcome?.success) {
        onSuccess();
        return;
      }
      setError(
        outcome?.message ??
          'The payment did not go through. Try again or use another card.',
      );
    } catch (err) {
      LOGGER.error(
        'Payment recovery failed',
        err instanceof Error ? err : new Error(String(err)),
      );
      setError(GENERIC_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <YStack gap="$3">
        <PaymentElement />
        {error && (
          <XStack
            gap="$2"
            alignItems="center"
            data-testid="payment-recovery-error"
            role="alert"
          >
            <AlertTriangle size={16} color={RED} />
            <Paragraph size="$3" style={{ color: RED }}>
              {error}
            </Paragraph>
          </XStack>
        )}
        <XStack gap="$3" justifyContent="flex-end" flexWrap="wrap">
          <Button chromeless onPress={onDismiss} disabled={submitting}>
            Cancel
          </Button>
          <Button
            backgroundColor={AMBER}
            color="white"
            disabled={!stripe || submitting}
            data-testid="payment-recovery-submit"
            onPress={() => void handleSubmit()}
          >
            {submitting ? 'Processing…' : 'Update payment & retry'}
          </Button>
        </XStack>
        <Button
          chromeless
          size="$3"
          onPress={onUsePortal}
          disabled={submitting}
          data-testid="payment-recovery-portal"
        >
          Manage in billing portal instead
        </Button>
      </YStack>
    </form>
  );
}

/**
 * LS-7398: in-app payment recovery for past-due subscriptions. Collects a new
 * payment method with Stripe Elements, then retries the failed invoice, so the
 * user never has to leave the app. The billing portal stays reachable as a
 * fallback.
 */
export function PaymentRecoveryModal(props: PaymentRecoveryModalProps) {
  const { onDismiss, onUsePortal } = props;
  const [createSetupIntent] = useCreateSetupIntentMutation();
  const [setup, setSetup] = useState<{
    clientSecret: string;
    publishableKey: string;
  } | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createSetupIntent()
      .then((result) => {
        const data = result.data?.createSetupIntent;
        if (cancelled) return;
        if (data?.clientSecret && data.publishableKey) {
          setSetup({
            clientSecret: data.clientSecret,
            publishableKey: data.publishableKey,
          });
        } else {
          setLoadError(true);
        }
      })
      .catch((err: unknown) => {
        LOGGER.error(
          'Failed to create setup intent',
          err instanceof Error ? err : new Error(String(err)),
        );
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [createSetupIntent]);

  const stripePromise = useMemo(
    () => (setup ? loadStripe(setup.publishableKey) : null),
    [setup],
  );

  return (
    <YStack
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      alignItems="center"
      justifyContent="center"
      zIndex={1000}
      style={
        { backgroundColor: withAlpha(BG_DARK, 0.85) } as React.CSSProperties
      }
      data-testid="payment-recovery-modal"
    >
      <YStack
        maxWidth={480}
        width="90%"
        padding="$5"
        gap="$3"
        borderRadius="$4"
        style={{
          background: `linear-gradient(135deg, ${BG_DARK} 0%, ${BRAND_NAVY} 100%)`,
          border: `1px solid ${withAlpha(AMBER, 0.35)}`,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Update payment method"
      >
        <Paragraph size="$5" fontWeight="700">
          Update payment method
        </Paragraph>
        {!setup && !loadError && <Spinner />}
        {loadError && (
          <YStack gap="$3">
            <Paragraph
              size="$3"
              style={{ color: RED }}
              data-testid="payment-recovery-error"
            >
              Could not start the payment form. You can try again or use the
              billing portal.
            </Paragraph>
            <XStack gap="$3" justifyContent="flex-end">
              <Button chromeless onPress={onDismiss}>
                Cancel
              </Button>
              <Button onPress={onUsePortal}>Open billing portal</Button>
            </XStack>
          </YStack>
        )}
        {setup && stripePromise && (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: setup.clientSecret }}
          >
            <PaymentForm {...props} />
          </Elements>
        )}
      </YStack>
    </YStack>
  );
}
