import { analyzeMusicLoudness } from "./loudness";
import { resolveBonusFile } from "../bonus/media";

// Calibrated against the installed MGS3 Snake Eater recording. Playback applies
// the user's volume and the additional 10% reference-level boost separately.
export const MUSIC_REFERENCE_LUFS = -19.6;

export function loudnessGain(lufs: number, peak: number): number {
  if (!Number.isFinite(lufs) || !Number.isFinite(peak) || peak <= 0 || lufs < -70) return 1;
  // Keep headroom at maximum user volume and avoid extreme amplification of noise.
  return Math.min(10 ** ((MUSIC_REFERENCE_LUFS - lufs) / 20), 0.98 / peak, 4);
}

export async function normalizationForFile(dataDir: string, file: string): Promise<number> {
  const measured = await analyzeMusicLoudness(dataDir, file);
  return measured ? loudnessGain(measured.lufs, measured.peak) : 1;
}

export async function normalizationForInstalled(dataDir: string, url: string): Promise<number> {
  try { return await normalizationForFile(dataDir, (await resolveBonusFile(url)).file); }
  catch { return 1; }
}
