export function requestOrigin(request: Request, configuredOrigin?: string) {
  if (configuredOrigin) return new URL(configuredOrigin).origin;
  const url = new URL(request.url);
  // Next.js can normalize its internal URL to localhost. The Host header retains
  // the origin the browser visited; production proxies should set APP_URL.
  const host = request.headers.get("host") || url.host;
  return new URL(`${url.protocol}//${host}`).origin;
}

export function isSameOrigin(request: Request, configuredOrigin?: string) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === requestOrigin(request, configuredOrigin);
  } catch {
    return false;
  }
}
