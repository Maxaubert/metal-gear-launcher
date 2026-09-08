import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { extractUnityAsset } from "../../electron/main/extract/unity";
import { loadPacks } from "../../shared/packs";

const dir = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\MGS3";
const enabled = process.env.HUB_INTEGRATION === "1" && existsSync(join(dir, "METAL GEAR SOLID3.exe"));

describe.skipIf(!enabled)("unity extraction against the real MGS3 launcher", () => {
  it("extracts every mgs3 asset", async () => {
    const pack = loadPacks().find((p) => p.id === "mgs3")!;
    for (const a of pack.assets) {
      if (a.source !== "unity") continue;
      const dest = join(process.env.TEMP!, "hub-it", `${a.role}${a.type === "Font" ? ".otf" : a.type === "AudioClip" ? ".wav" : ".png"}`);
      await extractUnityAsset(dir, a, dest);
      expect(statSync(dest).size, a.role).toBeGreaterThan(1000);
    }
  }, 300_000);
});
