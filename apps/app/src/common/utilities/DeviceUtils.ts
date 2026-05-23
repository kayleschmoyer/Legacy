import { isDevice } from 'expo-device';

export const isPhysicalDevice: boolean = isDevice ?? false;
