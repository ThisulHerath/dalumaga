import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { canUnlockSavedSession } from './offline-session-policy';
import type { DriverTrip } from './driver-queue';

export type DeviceIdentity = { id: string; secret: string };
export type CachedLoad = {
  loadId: string;
  crateCode: string;
  tareId: string;
  tareKg: string;
  scaleId: string;
  recorded: boolean;
};
export type CachedSession = {
  token: string;
  user: { id: string; displayName: string; roles: string[] };
  device: DeviceIdentity;
  expiresAt: string;
  savedAt: number;
  loads: CachedLoad[];
  trips?: DriverTrip[];
};
const SESSION_KEY = 'dalumaga.offline-session.v1';
const protectedOptions: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Unlock DaluMaga / දළුමඟ විවෘත කරන්න',
};
export async function deviceFor(userId: string): Promise<DeviceIdentity> {
  const key = 'dalumaga.device.' + userId;
  const existing = await SecureStore.getItemAsync(key);
  if (existing) {
    const device = JSON.parse(existing) as DeviceIdentity;
    if (!device.id || !/^[a-f0-9]{64}$/.test(device.secret))
      throw new Error('Device registration is invalid');
    return device;
  }
  const bytes = await Crypto.getRandomBytesAsync(32);
  const device = {
    id: Crypto.randomUUID(),
    secret: Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join(''),
  };
  await SecureStore.setItemAsync(key, JSON.stringify(device));
  return device;
}
export async function saveOfflineSession(session: CachedSession): Promise<void> {
  if (!SecureStore.canUseBiometricAuthentication())
    throw new Error('Set up a fingerprint or supported biometric to unlock offline');
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), protectedOptions);
}
export async function unlockOfflineSession(now = Date.now()): Promise<CachedSession> {
  const value = await SecureStore.getItemAsync(SESSION_KEY, protectedOptions);
  if (!value) throw new Error('No saved session. Sign in online first.');
  const session = JSON.parse(value) as CachedSession;
  if (
    !session.token ||
    !session.user?.id ||
    !session.device?.secret ||
    !Array.isArray(session.loads) ||
    !canUnlockSavedSession(session.savedAt, session.expiresAt, now)
  ) {
    throw new Error('Saved session expired or device time changed. Sign in online.');
  }
  return session;
}
export async function removeOfflineSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
