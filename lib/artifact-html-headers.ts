/**
 * Headers para artefatos HTML autocontidos servidos ao iframe (D13/Regra #2).
 * Scripts/styles inline são necessários para navegação e tema; recursos externos ficam bloqueados.
 */
export function artifactHtmlResponseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:",
  };
}
