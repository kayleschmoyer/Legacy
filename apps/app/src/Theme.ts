import * as eva from '@eva-design/eva';
import { ThemeType } from '@ui-kitten/components';

const CUSTOM_THEME: ThemeType = {
  'color-primary-100': '#D6E4FF',
  'color-primary-200': '#ADC8FF',
  'color-primary-300': '#84A9FF',
  'color-primary-400': '#6690FF',
  'color-primary-500': '#3366FF',
  'color-primary-600': '#254EDB',
  'color-primary-700': '#1939B7',
  'color-primary-800': '#102693',
  'color-primary-900': '#091A7A',

  'color-success-100': '#F6FDCD',
  'color-success-200': '#EBFC9C',
  'color-success-300': '#DAF76A',
  'color-success-400': '#C8EF44',
  'color-success-500': '#AEE50B',
  'color-success-600': '#90C408',
  'color-success-700': '#74A405',
  'color-success-800': '#5A8403',
  'color-success-900': '#476D02',

  'color-info-100': '#D8FEF3',
  'color-info-200': '#B3FDEE',
  'color-info-300': '#8CFAED',
  'color-info-400': '#6EF5F1',
  'color-info-500': '#40E6EF',
  'color-info-600': '#2EB8CD',
  'color-info-700': '#208DAC',
  'color-info-800': '#14668A',
  'color-info-900': '#0C4B72',

  'color-warning-100': '#FFF5D8',
  'color-warning-200': '#FFE9B1',
  'color-warning-300': '#FFD98A',
  'color-warning-400': '#FFCA6D',
  'color-warning-500': '#FFB13D',
  'color-warning-600': '#DB8D2C',
  'color-warning-700': '#B76D1E',
  'color-warning-800': '#935013',
  'color-warning-900': '#7A3B0B',

  'color-danger-100': '#FFE4D7',
  'color-danger-200': '#FFC4AF',
  'color-danger-300': '#FF9C87',
  'color-danger-400': '#FF7669',
  'color-danger-500': '#FF3838',
  'color-danger-600': '#DB2838',
  'color-danger-700': '#B71C37',
  'color-danger-800': '#931133',
  'color-danger-900': '#7A0A31',
};

export const DARK_THEME: ThemeType = {
  ...(eva.dark as ThemeType),
  ...CUSTOM_THEME,
};

export const LIGHT_THEME: ThemeType = {
  ...(eva.light as ThemeType),
  ...CUSTOM_THEME,
};
