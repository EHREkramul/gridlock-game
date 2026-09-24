import Constants from 'expo-constants';
import { Platform } from 'react-native';

const SERVER_PORT = 2567;

/**
 * Where the game server lives.
 * 1. EXPO_PUBLIC_SERVER_URL wins (set it for staging / production builds).
 * 2. In development, reuse the host that serves the JS bundle: a phone running
 *    Expo Go on the same Wi-Fi, the Android emulator and the web build all reach
 *    the dev machine that way without any configuration.
 */
export function serverUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SERVER_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${SERVER_PORT}`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:${SERVER_PORT}`;
  return Platform.OS === 'android' ? `http://10.0.2.2:${SERVER_PORT}` : `http://localhost:${SERVER_PORT}`;
}

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
