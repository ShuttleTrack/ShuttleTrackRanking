/** Relative in-app path safe for NextAuth callbackUrl (no open redirects). */
export function safeCallbackUrl(raw: string | string[] | undefined, fallback = '/'): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback;
  return trimmed;
}
