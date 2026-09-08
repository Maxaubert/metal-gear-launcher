import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { extractM2Asset } from "../../electron/main/extract/m2";
import { loadPacks } from "../../shared/packs";

const dir = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\MGS1";
const enabled = process.env.HUB_INTEGRATION === "1" && existsSync(join(dir, "METAL GEAR SOLID.exe"));

describe.skipIf(!enabled)("m2 extraction against the real MGS1 install", () => {
  it("extracts every mgs1 m2 asset", async () => {
    const pack = loadPacks().find((p) => p.id === "mgs1")!;
    for (const a of pack.assets) {
      if (a.source !== "m2") continue;
      const ext = a.sprite ? ".png" : a.role === "bgm" ? ".wav" : a.role.startsWith("font") ? ".otf" : ".png";
      const dest = join(process.env.TEMP!, "hub-it", "mgs1", `${a.role}${ext}`);
      await extractM2Asset(dir, a, dest);
      expect(statSync(dest).size, a.role).toBeGreaterThan(1000);
    }
  }, 600_000);
});
