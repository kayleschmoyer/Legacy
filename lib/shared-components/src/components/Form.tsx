import React from 'react';
import { Text, YStack } from 'tamagui';
import { Input } from './Input';
import { Select, type SelectOption } from './Select';
import { SegmentedControl, type SegmentedOption } from './ToggleControls';
import { Button, type ButtonProps } from '../Button';

export interface FormInputField {
  type: 'input';
  key: string;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string;
}

export interface FormSelectField {
  type: 'select';
  key: string;
  label: string;
  value?: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}

export interface FormToggleField {
  type: 'toggle';
  key: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SegmentedOption[];
}

/** A single stacked field — union discriminated on `type`. */
export type FormField = FormInputField | FormSelectField | FormToggleField;

export interface FormProps {
  /** Fields rendered top-to-bottom, in order. */
  fields: FormField[];
  /** Submit button label. Omit `onSubmit` to render the form without a submit button. */
  submitLabel?: string;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  submitLoading?: boolean;
  submitVariant?: ButtonProps['variant'];
}

function FieldLabel({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Text
      fontFamily="$heading"
      fontWeight="700"
      fontSize={11}
      letterSpacing={1.1}
      textTransform="uppercase"
      color="$textMuted"
    >
      {children}
    </Text>
  );
}

/**
 * Stacked form layout — composes Input, Select, SegmentedControl (toggle) and
 * Button. Matches `preview/components-form.html`. Used for league create /
 * settings-style forms (STORYBOOK_PLAN.md Tier 2 mapping).
 */
export function Form({
  fields,
  submitLabel = 'Save',
  onSubmit,
  submitDisabled = false,
  submitLoading = false,
  submitVariant = 'primary',
}: FormProps): React.JSX.Element {
  return (
    <YStack gap="$4" maxWidth={420}>
      {fields.map((field) => {
        switch (field.type) {
          case 'input':
            return (
              <Input
                key={field.key}
                label={field.label}
                value={field.value}
                onChangeText={field.onChangeText}
                placeholder={field.placeholder}
                error={field.error}
              />
            );
          case 'select':
            return (
              <Select
                key={field.key}
                label={field.label}
                value={field.value}
                onValueChange={field.onValueChange}
                options={field.options}
                placeholder={field.placeholder}
              />
            );
          case 'toggle':
            return (
              <YStack key={field.key} gap="$2">
                <FieldLabel>{field.label}</FieldLabel>
                <SegmentedControl
                  variant="box"
                  value={field.value}
                  onValueChange={field.onValueChange}
                  options={field.options}
                />
              </YStack>
            );
          default:
            return null;
        }
      })}
      {onSubmit ? (
        <Button
          variant={submitVariant}
          onPress={onSubmit}
          disabled={submitDisabled}
          loading={submitLoading}
        >
          {submitLabel}
        </Button>
      ) : null}
    </YStack>
  );
}
