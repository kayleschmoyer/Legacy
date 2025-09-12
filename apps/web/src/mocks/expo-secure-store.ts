// Mock for expo-secure-store on web platform
// This provides web-safe fallbacks for SecureStore operations

export const getItemAsync = (key: string): Promise<string | null> => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return Promise.resolve(sessionStorage.getItem(key));
    }
    return Promise.resolve(null);
  } catch (error) {
    console.warn('Error reading from sessionStorage:', error);
    return Promise.resolve(null);
  }
};

export const setItemAsync = (
  key: string,
  value: string,
): Promise<void> => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, value);
    }
    return Promise.resolve();
  } catch (error) {
    console.warn('Error writing to sessionStorage:', error);
    return Promise.resolve();
  }
};

export const deleteItemAsync = (key: string): Promise<void> => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(key);
    }
    return Promise.resolve();
  } catch (error) {
    console.warn('Error removing from sessionStorage:', error);
    return Promise.resolve();
  }
};

export default {
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
};
