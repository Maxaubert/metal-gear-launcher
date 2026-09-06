import { describe, expect, it } from "vitest";
import { assetStudioArgs, psbInfoArgs, psbFileArgs, M2_SEED, M2_SEED_LENGTH } from "../../electron/main/extract/tools";

describe("tool arguments", () => {
  it("builds an AssetStudioModCLI command that filters by name and type", () => {
    expect(assetStudioArgs("C:\\g\\x.bundle", "C:\\out", ["mgs3_logo"], ["tex2d"])).toEqual([
      "C:\\g\\x.bundle", "-o", "C:\\out", "-t", "tex2d", "--filter-by-name", "mgs3_logo", "-g", "none", "--image-format", "png", "--audio-format", "wav",
    ]);
  });
  it("builds the FreeMote manifest command with the published seed", () => {
    expect(psbInfoArgs("C:\\g\\alldata.psb.m", "C:\\g\\alldata.bin", "C:\\out")).toEqual([
      "info-psb", "-k", M2_SEED, "-l", String(M2_SEED_LENGTH), "-b", "C:\\g\\alldata.bin", "-o", "C:\\out", "-raw", "C:\\g\\alldata.psb.m",
    ]);
    expect(M2_SEED).toBe("25G/xpvTbsb+6"); expect(M2_SEED_LENGTH).toBe(64);
  });
  it("builds the FreeMote single-file command", () => {
    expect(psbFileArgs("C:\\t\\outgame_menu_main.psb.m", "C:\\out")).toEqual(["-s", "25G/xpvTbsb+6", "-l", "64", "-o", "C:\\out", "C:\\t\\outgame_menu_main.psb.m"]);
  });
});
