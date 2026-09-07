import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

// `.main-visual` (spec 4.7) is `width: 50vw; height: 94vh; object-fit: contain;
// object-position: center bottom`, so its box aspect ratio is (50/94) times the window's own -
// this hub only ever runs true fullscreen on the primary display, which in practice is 16:9.
const BOX_ASPECT = (50 / 94) * (16 / 9);

// `object-fit: contain` bottom-anchored only avoids an empty gap ABOVE the visible art when the
// source is at least as tall, relative to its width, as the box. A wider source - true of MGS4's
// launcher background, an uncut composition rather than a portrait cutout, unlike Peace Walker's
// or MGS1's - gets letterboxed at the top instead, which pushes the real pixels below where the
// `edge-fade` mask's "linear fade over the top 12%" reaches (that fade is relative to the box,
// not to wherever the image happens to render inside it), so the mask never touches a single
// visible pixel there and the top of the portrait stays a hard, un-faded edge. Cropping the
// source to the box's own aspect ratio before it ever reaches the DOM removes the gap entirely,
// so the existing mask fades real pixels as designed. A source already narrower than the box
// (Peace Walker's, MGS1's) is left alone - it pillarboxes on the sides instead, which the mask's
// radial component already handles, and cropping it would only discard real width for nothing.
export async function fitMainVisualAspect(file: string): Promise<void> {
  const buf = await readFile(file);
  const meta = await sharp(buf).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h || w / h <= BOX_ASPECT * 1.02) return;

  const targetWidth = Math.round(h * BOX_ASPECT);
  if (targetWidth >= w) return;

  // Pick the horizontal window with the most opaque content rather than assuming the subject
  // sits at a fixed side, so this generalizes to any composition, not just "portrait on the
  // left" (verified against MGS4's asset, but not guaranteed for a future pack).
  const { data, info } = await sharp(buf).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const colAlpha = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y < height; y += 4) sum += data[(y * width + x) * channels + 3] ?? 0;
    colAlpha[x] = sum;
  }
  const prefix = new Float64Array(width + 1);
  for (let x = 0; x < width; x++) prefix[x + 1] = (prefix[x] ?? 0) + (colAlpha[x] ?? 0);
  let bestLeft = 0;
  let bestScore = -1;
  for (let left = 0; left <= width - targetWidth; left++) {
    const score = (prefix[left + targetWidth] ?? 0) - (prefix[left] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      bestLeft = left;
    }
  }

  const cropped = await sharp(buf).extract({ left: bestLeft, top: 0, width: targetWidth, height }).png().toBuffer();
  await writeFile(file, cropped);
}
