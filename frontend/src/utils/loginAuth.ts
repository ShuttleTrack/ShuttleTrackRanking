const DEFAULT_CALLBACK = '/';

/** Same-origin relative path only — blocks open redirects via `//` or absolute URLs. */
export function safeCallbackUrl(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'string') return DEFAULT_CALLBACK;
  if (!value.startsWith('/') || value.startsWith('//')) return DEFAULT_CALLBACK;
  return value;
}

export function getLoginErrorMessage(error: string | string[] | undefined): string | null {
  const code = Array.isArray(error) ? error[0] : error;
  if (!code || typeof code !== 'string') return null;
  if (code === 'AccessDenied') {
    return 'This Google account is not on the club roster. Ask a squad admin to add you, then try again.';
  }
  return 'Sign-in did not go through. Please try again.';
}
