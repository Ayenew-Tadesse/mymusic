/**
 * API client for the admin dashboard.
 *
 * The access token lives only in memory. The refresh token is an httpOnly
 * cookie set by the API (requested with `X-Client: web`), so it's never
 * readable by scripts. Concurrent 401s share a single refresh request.
 */
const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSignedOut: () => void = () => {};

export const setSignedOutHandler = (fn: () => void) => {
  onSignedOut = fn;
};
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: { path: string; message: string }[];
  constructor(status: number, message: string, code?: string, details?: { path: string; message: string }[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function refresh(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Client': 'web' },
    body: '{}',
  })
    .then(async (res) => {
      if (!res.ok) return false;
      accessToken = (await res.json()).accessToken;
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      'X-Client': 'web',
      ...(json !== undefined && { 'Content-Type': 'application/json' }),
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(path, init, false);
    accessToken = null;
    onSignedOut();
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body?.error?.message ?? res.statusText, body?.error?.code, body?.error?.details);
  return body as T;
}

export const tryRestoreSession = refresh;

/** Upload a file straight to object storage with a presigned URL from the API. */
export async function uploadFile(file: File, kind: 'audio' | 'image') {
  const target = await api<{ key: string; url: string; publicUrl: string | null; headers: Record<string, string> }>('/admin/uploads', {
    method: 'POST',
    json: { kind, contentType: file.type },
  });
  const put = await fetch(target.url, { method: 'PUT', headers: target.headers, body: file });
  if (!put.ok) throw new ApiError(put.status, 'Upload to storage failed');
  return target;
}

export type Page<T> = { items: T[]; page: number; limit: number; total: number; hasMore: boolean };

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
