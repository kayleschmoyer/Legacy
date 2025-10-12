import * as React from 'react';
import { forwardRef } from 'react';
import { Input as TamaguiInput, TextArea as TamaguiTextArea } from 'tamagui';
import type { InputProps, InputRef } from '../types/ui';

// Import Tamagui Input and TextArea components

// Input component with stable types
export const Input = forwardRef<InputRef, InputProps>(
  ({
    value,
    defaultValue,
    placeholder,
    placeholderTextColor,
    onChangeText,
    onFocus,
    onBlur,
    editable = true,
    multiline = false,
    numberOfLines,
    maxLength,
    keyboardType,
    autoCapitalize,
    secureTextEntry = false,
    ...props
  }, ref) => {
    // If multiline, use TextArea, otherwise use Input
    if (multiline) {
      return (
        <TamaguiTextArea
          ref={ref as any}
          value={value}
          defaultValue={defaultValue}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          editable={editable}
          numberOfLines={numberOfLines}
          maxLength={maxLength}
          secureTextEntry={secureTextEntry}
          flex={props.flex}
          width={props.width}
          height={props.height}
          minWidth={props.minWidth}
          minHeight={props.minHeight}
          maxWidth={props.maxWidth}
          maxHeight={props.maxHeight}
          margin={props.margin}
          marginTop={props.marginTop}
          marginRight={props.marginRight}
          marginBottom={props.marginBottom}
          marginLeft={props.marginLeft}
          marginHorizontal={props.marginHorizontal}
          marginVertical={props.marginVertical}
          padding={props.padding}
          paddingTop={props.paddingTop}
          paddingRight={props.paddingRight}
          paddingBottom={props.paddingBottom}
          paddingLeft={props.paddingLeft}
          paddingHorizontal={props.paddingHorizontal}
          paddingVertical={props.paddingVertical}
          backgroundColor={props.backgroundColor}
          borderColor={props.borderColor}
          borderWidth={props.borderWidth}
          borderRadius={props.borderRadius}
          testID={props.testID}
          id={props.id}
          accessibilityLabel={props.accessibilityLabel}
        />
      );
    }

    return (
      <TamaguiInput
        ref={ref as any}
        value={value}
        defaultValue={defaultValue}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        editable={editable}
        maxLength={maxLength}
        secureTextEntry={secureTextEntry}
        flex={props.flex}
        width={props.width}
        height={props.height}
        minWidth={props.minWidth}
        minHeight={props.minHeight}
        maxWidth={props.maxWidth}
        maxHeight={props.maxHeight}
        margin={props.margin}
        marginTop={props.marginTop}
        marginRight={props.marginRight}
        marginBottom={props.marginBottom}
        marginLeft={props.marginLeft}
        marginHorizontal={props.marginHorizontal}
        marginVertical={props.marginVertical}
        padding={props.padding}
        paddingTop={props.paddingTop}
        paddingRight={props.paddingRight}
        paddingBottom={props.paddingBottom}
        paddingLeft={props.paddingLeft}
        paddingHorizontal={props.paddingHorizontal}
        paddingVertical={props.paddingVertical}
        backgroundColor={props.backgroundColor}
        borderColor={props.borderColor}
        borderWidth={props.borderWidth}
        borderRadius={props.borderRadius}
        testID={props.testID}
        id={props.id}
        accessibilityLabel={props.accessibilityLabel}
      />
    );
  }
);

Input.displayName = 'Input';

// TextArea component - alias for multiline Input
export const TextArea = forwardRef<InputRef, InputProps>(
  (props, ref) => <Input ref={ref} multiline {...props} />
);

TextArea.displayName = 'TextArea';

// Specialized input components
export const PasswordInput = forwardRef<InputRef, Omit<InputProps, 'secureTextEntry'>>(
  (props, ref) => <Input ref={ref} secureTextEntry {...props} />
);

PasswordInput.displayName = 'PasswordInput';

export const EmailInput = forwardRef<InputRef, Omit<InputProps, 'keyboardType' | 'autoCapitalize'>>(
  (props, ref) => <Input ref={ref} keyboardType="email-address" autoCapitalize="none" {...props} />
);

EmailInput.displayName = 'EmailInput';

export const PhoneInput = forwardRef<InputRef, Omit<InputProps, 'keyboardType'>>(
  (props, ref) => <Input ref={ref} keyboardType="phone-pad" {...props} />
);

PhoneInput.displayName = 'PhoneInput';

export const NumberInput = forwardRef<InputRef, Omit<InputProps, 'keyboardType'>>(
  (props, ref) => <Input ref={ref} keyboardType="numeric" {...props} />
);

NumberInput.displayName = 'NumberInput';
