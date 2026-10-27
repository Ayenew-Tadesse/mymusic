/**
 * HTTP client.
 *
 * - The refresh token is kept in the OS keystore (expo-secure-store); the
 *   access token only in memory.
 * - A 401 triggers one shared refresh; concurrent requests wait for it, so
 *   rotation never races (the server treats refresh token reuse as theft).
 */
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const REFRESH_KEY = 'mm.refreshToken';

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onSessionExpired: () => void = () => {};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Thrown when the device can't reach the server (as opposed to an HTTP error). */
export class NetworkError extends Error {}

export const deviceName = () => `${Device.manufacturer ?? ''} ${Device.modelName ?? 'device'}`.trim().slice(0, 120);

export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

export async function storeSession(tokens: { accessToken: string; refreshToken: string }) {
  accessToken = tokens.accessToken;
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
}

export async function clearSession() {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export const getRefreshToken = () => SecureStore.getItemAsync(REFRESH_KEY);

async function rawFetch(path: string, init: RequestInit) {
  try {
    return await fetch(`${API_URL}/api/v1${path}`, init);
  } catch {
    throw new NetworkError('Can’t reach MyMusic. Check your connection.');
  }
}

/**
 * Exchange the stored refresh token for a new pair.
 * Resolves false when the session is gone; throws NetworkError when offline.
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return false;
    const res = await rawFetch('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken, deviceName: deviceName() }),
    });
    if (res.status === 401) {
      await clearSession();
      return false;
    }
    if (!res.ok) throw new ApiError(res.status, 'Could not refresh session');
    await storeSession(await res.json());
    return true;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; auth?: boolean };

export async function api<T = void>(path: string, { body, auth = true, headers, ...init }: Options = {}): Promise<T> {
  const doFetch = () =>
    rawFetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(auth && accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch();
  if (res.status === 401 && auth) {
    if (await refreshSession()) {
      res = await doFetch();
    } else {
      onSessionExpired();
    }
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json?.error?.message ?? 'Something went wrong', json?.error?.code);
  return json as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
