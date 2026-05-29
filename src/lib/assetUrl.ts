function joinBaseAndPath(base: string, path: string): string {
  const normalizedPath = path.replace(/^\//, "");
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}${normalizedPath}`;
}

/** Resolves a public asset path using Vite base (e.g. /net-monitor-dashboard/). */
export function assetUrl(path: string): string {
  return joinBaseAndPath(import.meta.env.BASE_URL, path);
}
