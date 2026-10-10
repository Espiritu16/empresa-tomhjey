export function enlacePdfSeguro(enlace: string | null): string | null {
  if (!enlace) return null;
  try {
    const url = new URL(enlace);
    return url.protocol === "https:" &&
      (url.hostname === "nubefact.com" ||
        url.hostname.endsWith(".nubefact.com"))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
