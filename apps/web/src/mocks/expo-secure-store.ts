// Mock for expo-secure-store on web platform
// This provides web-safe fallbacks for SecureStore operations

export const getItemAsync = async (key: string): Promise<string | null> => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(key);
    }
    return null;
  } catch (error) {
    console.warn('Error reading from sessionStorage:', error);
    return null;
  }
};

export const setItemAsync = async (
  key: string,
  value: string,
): Promise<void> => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, value);
    }
  } catch (error) {
    console.warn('Error writing to sessionStorage:', error);
  }
};

export const deleteItemAsync = async (key: string): Promise<void> => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(key);
    }
  } catch (error) {
    console.warn('Error removing from sessionStorage:', error);
  }
};

export default {
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
};
