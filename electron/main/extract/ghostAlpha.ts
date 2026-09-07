import sharp from "sharp";
import type { AssetRole } from "@shared/packs";

// The `year`/`numbering` roles (spec 4.7's right-column "ghost" layer) are meant to read as one
// faint, evenly legible watermark on their own - the normalized alpha band below IS the final
// on-screen density (`.ghost-timeline`/`.ghost-number` in global.css render at full CSS opacity,
// not a second dimming pass on top). The raw M2/Unity textures do not cooperate on their own,
// and they fail in two different ways verified against the real extracted assets:
//
// 1. Nearly everywhere, the genuine timeline/number art bakes in at single-digit mean alpha (a
//    histogram of the non-transparent pixels is cleanly bimodal - a large low cluster under 50
//    and, only for `year`, a second cluster at 255). Invisible without this lift, which is why
//    MGS1, MGS4 and Peace Walker read as flat paper.
// 2. MGS3's (and MGS1's) `year` sprite additionally bakes in a fully-opaque (255) copy of the
//    pack's own current header - a leftover frame from the source UI's own "current entry"
//    highlight - sitting in the same texture as the genuinely faint timeline dates. Once anything
//    is boosted to visible, that opaque block reads as a stray duplicate of the live header
//    rather than a timeline, exactly as reported.
//
// Both are fixed by treating "year" alpha bimodally instead of with one linear remap: the low
// cluster (real timeline art) is lifted into a legible band, and the high cluster (baked "current
// game" duplicate) is dropped to fully transparent instead of merely dimmed, since dimming it
// still leaves it legible as a copy of the header. `numbering` has no such duplicate-frame
// contamination in any pack's extracted asset, so it only gets the lift/cap band, never the drop.
const GHOST_MIN_ALPHA = 45;
const GHOST_MAX_ALPHA = 170;
const YEAR_DUPLICATE_ALPHA_FLOOR = 200; // above this, `year` content is the baked duplicate, not timeline art

export async function normalizeGhostAlpha(file: string, role: AssetRole): Promise<void> {
  const { data, info } = await sharp(file).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i] ?? 0;
    if (a === 0) continue;
    if (role === "year" && a >= YEAR_DUPLICATE_ALPHA_FLOOR) data[i] = 0;
    else data[i] = Math.min(GHOST_MAX_ALPHA, Math.max(GHOST_MIN_ALPHA, a));
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(file);
}
