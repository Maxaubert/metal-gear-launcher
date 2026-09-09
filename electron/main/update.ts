import { z } from "zod";

const RELEASES_URL = "https://api.github.com/repos/Maxaubert/metal-gear-launcher/releases/latest";
const TIMEOUT_MS = 5000;

const releaseSchema = z.object({ tag_name: z.string(), html_url: z.string() });

export type UpdateInfo = { version: string; url: string };

function parseVersion(value: string): { numbers: number[]; prerelease: boolean } | undefined {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  if (!match || match[4]?.split(".").some(part => /^0\d+$/.test(part))) return undefined;
  const numbers = match.slice(1, 4).map(Number);
  return numbers.every(Number.isSafeInteger) ? { numbers, prerelease: Boolean(match[4]) } : undefined;
}

function isNewerStableVersion(latest: string, current: string): boolean {
  const candidate = parseVersion(latest), installed = parseVersion(current);
  // The normal update channel offers stable releases only, including for local branch builds.
  if (!candidate || !installed || candidate.prerelease) return false;
  for (let index = 0; index < 3; index++) {
    if (candidate.numbers[index] !== installed.numbers[index]) return candidate.numbers[index]! > installed.numbers[index]!;
  }
  return installed.prerelease;
}

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
    return isNewerStableVersion(version, currentVersion) ? { version, url: html_url } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
