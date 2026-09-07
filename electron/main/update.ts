import { z } from "zod";

const RELEASES_URL = "https://api.github.com/repos/Maxaubert/mgs-master-hub/releases/latest";
const TIMEOUT_MS = 5000;

const releaseSchema = z.object({ tag_name: z.string(), html_url: z.string() });

export type UpdateInfo = { version: string; url: string };

/**
 * Checks GitHub Releases for a version newer than `currentVersion`. Best-effort: a network
 * failure, a timeout, a non-2xx response or a malformed body all resolve to `null` instead of
 * rejecting, so this can never block boot or crash the hub. `fetchImpl` is injectable so tests
 * never touch the network.
 */
export async function checkForUpdate(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateInfo | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(RELEASES_URL, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const { tag_name, html_url } = releaseSchema.parse(await res.json());
    const version = tag_name.replace(/^v/, "");
    return version === currentVersion ? null : { version, url: html_url };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
