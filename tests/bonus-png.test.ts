import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { cachedBonusPng } from "../electron/main/bonus/png";

it("repairs truncated derived artwork even when its PNG metadata remains readable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hub-bonus-png-"));
  try {
    const file = join(directory, "banner.png");
    const pixels = Buffer.from(Array.from({ length: 64 * 64 * 3 }, (_, index) => (index * 37 + Math.floor(index / 11)) % 256));
    const png = await sharp(pixels, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
    await writeFile(file, png.subarray(0, 64));
    expect((await sharp(file).metadata()).width).toBe(64);
    await expect(sharp(file).raw().toBuffer()).rejects.toThrow();
    const render = vi.fn().mockResolvedValue(png);
    await cachedBonusPng(file, render);
    expect(await sharp(file).raw().toBuffer()).toEqual(pixels);
    expect(await readFile(file)).toEqual(png);
    await cachedBonusPng(file, render);
    expect(render).toHaveBeenCalledTimes(1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
