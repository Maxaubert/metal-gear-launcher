import { expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { allowBonusFile, resolveBonusFile } from "../electron/main/bonus/media";

it("reading more than 1024 book images cannot evict persistent menu music or artwork", async () => {
  const directory = await mkdtemp(join(tmpdir(), "book-media-"));
  try {
    const media = join(directory, "music.flac"); const artwork = join(directory, "menu.png");
    await writeFile(media, "audio fixture"); await writeFile(artwork, "artwork fixture");
    const musicUrl = await allowBonusFile(media, directory, "audio/flac");
    const artworkUrl = await allowBonusFile(artwork, directory, "image/png");
    for (let page = 0; page < 1050; page++) {
      const file = join(directory, `page-${page}.png`);
      await writeFile(file, "page fixture");
      await allowBonusFile(file, directory, "image/png", "books");
    }
    expect((await resolveBonusFile(musicUrl)).contentType).toBe("audio/flac");
    expect((await resolveBonusFile(artworkUrl)).contentType).toBe("image/png");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
