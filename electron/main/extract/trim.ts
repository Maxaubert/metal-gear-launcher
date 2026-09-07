import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Every extracted image is trimmed to its own content bounding box (round 8, critique finding A -
// a regression this pass introduced and then generalized into a fix). AssetStudioModCLI's raw
// Texture2D/Sprite dumps aren't guaranteed to be pre-cropped to their subject: re-extracting
// MGS3's `mainVisual` produced a 2048x1263 canvas with the real art confined to (351,60)-
// (1664,1263) - padded on all sides - where an earlier extraction of the exact same pack/asset
// name had produced a 1194x1263 canvas already tight to the ink. Nothing in this repo's own code
// caused that: the tool's own output for the same input apparently isn't byte-for-byte stable
// across runs on this point. Since every `visualFit` box is sized in `vw`/`vh` against the
// asset's own aspect ratio, a pack means something different depending on how much invisible
// padding happened to survive that run - `sharp.trim()` removes it, so a `visualFit` box is
// always measured against the same convention (content edge to content edge) for all six games,
// not whatever padding a given extraction happened to produce. Sharp's default trim reference is
// the image's own top-left pixel, so it's a safe no-op on an asset that has no padding to begin
// with (nothing at the edges matches that corner) rather than a bug for a future case.
export async function trimToContent(file: string): Promise<void> {
  const buf = await readFile(file);
  const trimmed = await sharp(buf).trim().png().toBuffer();
  await writeFile(file, trimmed);
}
