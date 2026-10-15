let csrfToken: string | null = null;

export async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  try {
    const res = await fetch('/api/auth/csrf', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      csrfToken = data.csrfToken;
      return csrfToken!;
    }
  } catch (err) {
    console.warn('[CSRF] Failed to fetch csrf token', err);
  }
  return '';
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getCsrfToken();
  const headers = new Headers(options.headers || {});

  // If payload is not FormData, ensure Content-Type is application/json
  if (options.body && !(options.body instanceof FormData)) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  if (token) {
    headers.set('x-csrf-token', token);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include'
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMsg = (isJson && data?.error) ? data.error : `Request failed with status ${response.status}`;
    const error = new Error(errorMsg) as any;
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}
