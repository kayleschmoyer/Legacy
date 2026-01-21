declare module 'react-native-table-component' {
  import type { ComponentType } from 'react';
  import type { TextStyle, ViewStyle } from 'react-native';

  export interface TableProps {
    style?: ViewStyle;
    borderStyle?: ViewStyle;
    children?: React.ReactNode;
  }

  export interface RowProps {
    data: (string | number | React.ReactNode)[];
    style?: ViewStyle;
    textStyle?: TextStyle;
    flexArr?: number[];
    widthArr?: number[];
  }

  export interface RowsProps {
    data: (string | number | React.ReactNode)[][];
    style?: ViewStyle;
    textStyle?: TextStyle;
    flexArr?: number[];
    widthArr?: number[];
  }

  export interface CellProps {
    data: string | number | React.ReactNode;
    style?: ViewStyle;
    textStyle?: TextStyle;
    width?: number;
    flex?: number;
  }

  export interface ColProps {
    data: (string | number | React.ReactNode)[];
    style?: ViewStyle;
    textStyle?: TextStyle;
    heightArr?: number[];
  }

  export interface ColsProps {
    data: (string | number | React.ReactNode)[][];
    style?: ViewStyle;
    textStyle?: TextStyle;
    heightArr?: number[];
  }

  export interface TableWrapperProps {
    style?: ViewStyle;
    children?: React.ReactNode;
  }

  export const Table: ComponentType<TableProps>;
  export const Row: ComponentType<RowProps>;
  export const Rows: ComponentType<RowsProps>;
  export const Cell: ComponentType<CellProps>;
  export const Col: ComponentType<ColProps>;
  export const Cols: ComponentType<ColsProps>;
  export const TableWrapper: ComponentType<TableWrapperProps>;
}
