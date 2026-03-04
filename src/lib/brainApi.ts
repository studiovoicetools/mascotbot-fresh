export const BRAIN_API_URL =
  process.env.BRAIN_API_URL || "https://efro-five.vercel.app";

/**
 * Silent warm-up ping to the Brain API.
 * Wakes up the Vercel function from cold-start before the actual request.
 * Never throws — all errors are swallowed.
 */
export async function pingBrainApi(): Promise<boolean> {
  try {
    const res = await fetch(`${BRAIN_API_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
