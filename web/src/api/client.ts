/**
 * HTTP client for the web app.
 *
 * The site and the API share one origin. The refresh token is an httpOnly
 * cookie (requested with `X-Client: web`), so page scripts never see it; the
 * access token lives only in memory. Concurrent 401s share one refresh.
 */
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onExpired: () => void = () => {};

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const setAccessToken = (t: string | null) => {
  accessToken = t;
};
export const setSessionExpiredHandler = (fn: () => void) => {
  onExpired = fn;
};

export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Client': 'web' },
    body: JSON.stringify({ deviceName: 'Web browser' }),
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

type Options = Omit<RequestInit, 'body'> & { body?: unknown };

export async function api<T = void>(path: string, { body, headers, ...init }: Options = {}): Promise<T> {
  const run = () =>
    fetch(`/api/v1${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-Client': 'web',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res: Response;
  try {
    res = await run();
    if (res.status === 401 && !path.startsWith('/auth/')) {
      if (await refreshSession()) res = await run();
      else onExpired();
    }
  } catch {
    throw new ApiError(0, 'Can’t reach MyMusic. Check your connection.');
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json?.error?.message ?? 'Something went wrong', json?.error?.code);
  return json as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
