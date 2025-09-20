import React from 'react';
import { PlatformUtils } from './platform-components/wrappers/PlatformUtils';

export interface DropdownItem {
  text: string;
  value: string;
}

export interface DropdownProperties {
  value: string;
  onChange: (value: string) => void;
  items: readonly Readonly<DropdownItem>[];
  placeholder?: string;
}

// React Native implementation
const RNDropdown = (props: DropdownProperties) => {
  const { value, onChange, items, placeholder } = props;

  return (
    <div style={{ padding: '10px' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '8px',
          borderRadius: '4px',
          border: '1px solid #ccc',
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.text}
          </option>
        ))}
      </select>
    </div>
  );
};

// Web implementation
const WebDropdown = (props: DropdownProperties) => {
  const { value, onChange, items, placeholder } = props;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid var(--color-basic-600, #8F9BB3)',
        backgroundColor: 'var(--color-basic-100, #FFFFFF)',
        color: 'var(--color-basic-800, #222B45)',
        fontSize: '16px',
        minWidth: '120px',
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.text}
        </option>
      ))}
    </select>
  );
};

function Dropdown(props: DropdownProperties) {
  if (PlatformUtils.isWeb) {
    return <WebDropdown {...props} />;
  }
  return <RNDropdown {...props} />;
}

export { Dropdown };
