import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import sharp from "sharp";

export async function cachedBonusPng(file: string, render: () => Promise<Buffer>): Promise<string> {
  try {
    // PNG headers can survive an interrupted write. Decode pixels before reuse.
    await sharp(file).raw().toBuffer();
    return file;
  } catch { /* Rebuild missing or partially written artwork. */ }
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, await render());
    await rename(temporary, file);
    return file;
  } finally { await rm(temporary, { force: true }); }
}
