import { describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractUnityAsset } from "../../electron/main/extract/unity";

describe("extractUnityAsset", () => {
  it("runs AssetStudioModCLI and moves the named png into place", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "hub-"));
    const run = vi.fn(async (_exe: string, args: string[]) => {
      const out = args[args.indexOf("-o") + 1]!;
      await mkdir(join(out, "Texture2D"), { recursive: true });
      await writeFile(join(out, "Texture2D", "mgs3_logo.png"), "png");
      return { code: 0, stdout: "", stderr: "" };
    });
    const dest = join(tmp, "logo.png");
    await extractUnityAsset("C:\\game", { role: "logo", source: "unity", path: "a.bundle", name: "mgs3_logo", type: "Texture2D", edge: "cut" }, dest,
      { run, tools: () => ({ assetStudio: "as.exe", psbDecompile: "psb.exe" }) });
    expect(await readFile(dest, "utf8")).toBe("png");
    expect(run.mock.calls[0]![1]![0]).toBe("C:\\game\\a.bundle");
  });
  it("throws with stderr when the tool fails", async () => {
    const run = vi.fn(async () => ({ code: 1, stdout: "", stderr: "boom" }));
    await expect(extractUnityAsset("C:\\g", { role: "logo", source: "unity", path: "a", name: "n", type: "Texture2D", edge: "cut" }, "C:\\x.png",
      { run, tools: () => ({ assetStudio: "a", psbDecompile: "b" }) })).rejects.toThrow(/boom/);
  });

  it("selects the exact sprite instead of a localized prefix match", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "hub-"));
    const run = vi.fn(async (_exe: string, args: string[]) => {
      const out = args[args.indexOf("-o") + 1]!;
      await mkdir(join(out, "a-localized"));
      await writeFile(join(out, "a-localized", "year_en.png"), "subtitle");
      await writeFile(join(out, "year_#60.png"), "date");
      return { code: 0, stdout: "", stderr: "" };
    });
    const dest = join(tmp, "date.png");
    await extractUnityAsset("C:\\game", { role: "headerYear", source: "unity", path: "a.bundle", name: "year", type: "Sprite", edge: "cut" }, dest,
      { run, tools: () => ({ assetStudio: "as.exe", psbDecompile: "psb.exe" }) });
    expect(await readFile(dest, "utf8")).toBe("date");
  });
});
