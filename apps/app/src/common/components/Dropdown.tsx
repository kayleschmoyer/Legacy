import { IndexPath, Select, SelectItem } from '@ui-kitten/components';
import { useEffect, useState } from 'react';

export interface DropdownItem {
  text: string;
  value: string;
}

export interface DropdownProperties {
  value: string;
  onChange: (value: string) => void;
  items: readonly Readonly<DropdownItem>[];
}

export function Dropdown(props: DropdownProperties): JSX.Element {
  const { value, onChange, items } = props;

  const [selectedIndex, setSelectedIndex] = useState<
    IndexPath | IndexPath[] | undefined
  >();

  useEffect(() => {
    const idx = items.findIndex((i) => value === i.value);

    if (idx !== -1) {
      setSelectedIndex(new IndexPath(idx));
    }
  }, [value, items]);

  const internalOnChange = (idx: IndexPath | IndexPath[]) => {
    if (Array.isArray(idx)) {
      throw new Error('Multi select not supported currently');
    }

    const item = items[idx.row];

    if (item) {
      onChange(item.value);
    }
  };

  return (
    <Select selectedIndex={selectedIndex} onSelect={internalOnChange}>
      {items.map((i) => (
        <SelectItem title={i.text} />
      ))}
    </Select>
  );
}
