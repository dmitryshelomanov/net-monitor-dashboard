/** Resolves a public/ asset path for the current Vite base (e.g. GitHub Pages subpath). */
export function assetUrl(path: string): string {
  const normalized = path.replace(/^\//, "");
  return `${import.meta.env.BASE_URL}${normalized}`;
}
