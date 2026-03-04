/**
 * Generiert eine einmalige Session-ID für den aktuellen Browser-Tab.
 * Bleibt für die gesamte Lebensdauer der Seite gleich.
 * Verwendet Web Crypto API wenn verfügbar, sonst Math.random Fallback.
 */
export function generateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback für ältere Browser
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
