import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { IniDocument } from "../electron/main/settings/ini";
import { patchBinaryVersion, preparePatchEdits, readPatchSettings } from "../electron/main/settings/patches";
import { isHdHotkey, patchSchemas } from "../electron/main/settings/patchSchemas";

function binaryVersion(major: number, minor: number, patch: number): Buffer {
  const bytes = Buffer.alloc(120);
  Buffer.from("VS_VERSION_INFO\0", "utf16le").copy(bytes, 20);
  bytes.writeUInt32LE(0xfeef04bd, 56);
  bytes.writeUInt32LE((major << 16) | minor, 64);
  bytes.writeUInt32LE(patch << 16, 68);
  return bytes;
}

describe("lossless INI edits", () => {
  it("preserves comments, unknown keys, whitespace, BOM and CRLF", () => {
    const text = '\ufeff; header\r\n[Graphics]\r\n  Enabled = false   ; keep comment\r\nOther = "untouched # value"\r\n';
    const updated = new IniDocument(Buffer.from(text)).edit([{ section: "Graphics", key: "Enabled", value: "true" }]);
    expect(updated.toString()).toBe(text.replace("false", "true"));
  });
  it("edits UTF-16LE without transcoding surrounding text", () => {
    const original = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("[Audio]\nVolume=3\nNote=Blå", "utf16le")]);
    const updated = new IniDocument(original).edit([{ section: "Audio", key: "Volume", value: "5" }]);
    expect(updated.subarray(0, 2)).toEqual(original.subarray(0, 2));
    expect(updated.subarray(2).toString("utf16le")).toBe("[Audio]\nVolume=5\nNote=Blå");
  });
  it("adds keys inside their own section and appends new sections", () => {
    const document = new IniDocument(Buffer.from("[First]\nA=1\n[Second]\nB=2"));
    const updated = document.edit([{ section: "First", key: "C", value: "3" }, { section: "Third", key: "D", value: "4" }]);
    const reread = new IniDocument(updated);
    expect(reread.get("First", "C")).toBe("3");
    expect(reread.get("Second", "B")).toBe("2");
    expect(reread.get("Third", "D")).toBe("4");
  });
  it("rejects ambiguous, malformed, invalid-encoding and injected edits", () => {
    expect(() => new IniDocument(Buffer.from("[A]\nx=1\nx=2"))).toThrow("Duplicate");
    expect(() => new IniDocument(Buffer.from("[A]\nx=1\n[A]\ny=2"))).toThrow("Duplicate");
    expect(() => new IniDocument(Buffer.from("[A]\nx=\"broken"))).toThrow("Unclosed");
    expect(() => new IniDocument(Buffer.from([0xff]))).toThrow();
    expect(() => new IniDocument(Buffer.alloc(0)).edit([{ section: "A", key: "B", value: "1\nInjected=true" }])).toThrow();
  });
});

describe("patch settings adapters", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "hub-patch-settings-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
  async function file(path: string, bytes: string | Buffer): Promise<void> {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), bytes);
  }

  it("recognizes fixed binary versions and SSU's embedded banner", () => {
    expect(patchBinaryVersion(binaryVersion(4, 1, 1))).toBe("4.1.1");
    expect(patchBinaryVersion(Buffer.from("SunnySideUp 1.0.6\0"))).toBe("1.0.6");
    expect(patchBinaryVersion(Buffer.from("not a version"))).toBeUndefined();
  });

  it("accepts verified HD hotkey aliases and rejects unsupported combinations", () => {
    for (const key of ["Page Up", "F24", "Mouse4", "WheelDown", "NumMultiply", "VK_INSERT", "Pad_LB", "Pad_DPad_Up", "A", "0x2D"]) expect(isHdHotkey(key), key).toBe(true);
    for (const key of ["", "None", "Ctrl+K", "Mouse6", "F25", "0xFFFF", "MadeUpKey"]) expect(isHdHotkey(key), key).toBe(false);
  });

  it("requires a patch binary; stray config and backups do not count", async () => {
    await file("MGSM2Fix.ini", "[Launcher]\nSkipNotice=true\n");
    await file("MGSM2Fix64.asi.bak", binaryVersion(3, 7, 2));
    expect((await readPatchSettings("mgs1", dir)).sections).toEqual([]);
  });

  it("reads installed M2 controls, prepares exact minimal edits, and never writes live files", async () => {
    await file("MGSM2Fix64.asi", binaryVersion(3, 7, 2));
    const original = '; custom\r\n[Launcher]\r\nSkipNotice = true ; keep\r\nStartGame=false\r\n[Future]\r\nWhatever=42\r\n';
    await file("MGSM2Fix.ini", original);
    const result = await readPatchSettings("mgs1", dir);
    expect(result.sections[0]?.status).toBe("ready");
    const writes = preparePatchEdits(result.sources, [{ sectionId: "mgsm2fix", fieldId: "Launcher/SkipNotice", value: false }]);
    expect(writes[0]?.updated.toString()).toBe(original.replace("SkipNotice = true", "SkipNotice = false"));
    expect(await readFile(join(dir, "MGSM2Fix.ini"), "utf8")).toBe(original);
    expect(preparePatchEdits(result.sources, [])).toEqual([]);
  });

  it("finds M2 config next to the first binary in its documented subfolder search order", async () => {
    await file("scripts/MGSM2Fix32.asi", binaryVersion(3, 7, 2));
    await file("scripts/MGSM2Fix.ini", "[Launcher]\nSkipNotice=false\n");
    const result = await readPatchSettings("mgs1", dir);
    expect(result.sources[0]?.path).toBe(join(dir, "scripts/MGSM2Fix.ini"));
  });

  it("missing HD config stays read-only until explicit initialization with complete defaults", async () => {
    await file("plugins/MGSHDFix.asi", binaryVersion(4, 1, 1));
    const result = await readPatchSettings("mgs2", dir);
    expect(result.sections[0]?.status).toBe("needsSetup");
    expect(result.sections[0]?.fields.some(field => field.label.includes("Reset All"))).toBe(false);
    const change = { sectionId: "mgshdfix", fieldId: "EnableSMAA", value: false };
    expect(() => preparePatchEdits(result.sources, [change])).toThrow("Initialize");
    const writes = preparePatchEdits(result.sources, [change], ["mgshdfix"]);
    const document = new IniDocument(writes[0]!.updated);
    expect(document.get("Enhancements and Tweaks", "Enable SMAA Anti-Aliasing")).toBe("0");
    expect(document.get("Window Settings", "Fullscreen, Borderless, and Windowed")).toBe('"Borderless Fullscreen"');
    expect(document.get("Language Settings", "Game Language")).toBe('"en"');
    for (const field of patchSchemas.mgshdfix!.fields) expect(document.get(field.section, field.key)).toBeDefined();
    await expect(readFile(join(dir, "plugins/MGSHDFix.settings"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("unknown binary versions cannot be initialized or edited", async () => {
    await file("plugins/MGSHDFix.asi", binaryVersion(9, 0, 0));
    const result = await readPatchSettings("mgs2", dir);
    expect(result.sections[0]?.status).toBe("unsupported");
    expect(() => preparePatchEdits(result.sources, [], ["mgshdfix"])).toThrow("Unsupported");
  });

  it("initializes MGS3's region using its own upstream first language pair", async () => {
    await file("plugins/MGSHDFix.asi", binaryVersion(4, 1, 1));
    const result = await readPatchSettings("mgs3", dir);
    const [write] = preparePatchEdits(result.sources, [], ["mgshdfix"]);
    const document = new IniDocument(write!.updated);
    expect(document.get("Language Settings", "Game Region")).toBe('"us"');
    expect(document.get("Language Settings", "Game Language")).toBe('"en"');
  });

  it("filters Patriot fields per game and never exposes registry options as writable", async () => {
    await file("mgspw/scripts/MGSPatriotFix.asi", binaryVersion(0, 2, 1));
    await file("MGSPatriotFix.settings", '[Launcher and Splashscreens]\nInternal Resolution (PW)="FHD"\nSkip Launcher=0\n');
    const result = await readPatchSettings("mgspw", dir);
    expect(result.sections[0]?.fields.some(field => field.label === "Disable Motion Blur")).toBe(false);
    expect(result.sections[0]?.fields.some(field => field.label.includes("Fullscreen Optimization"))).toBe(false);
    const writes = preparePatchEdits(result.sources, [{ sectionId: "mgspatriotfix", fieldId: "GameResolution_PW", value: "Original" }]);
    expect(writes[0]?.updated.toString()).toContain('Internal Resolution (PW)="Original"');
  });

  it("enforces typed values, ranges, unknown-key protection and duplicate-change rejection", async () => {
    await file("MGS4/scripts/MGSPatriotFix.asi", binaryVersion(0, 2, 1));
    await file("MGSPatriotFix.settings", '[Enhancements && Tweaks]\nAnisotropic Filtering Level=16\nCustom Shadow Resolution="2048"\n');
    const result = await readPatchSettings("mgs4", dir);
    const change = { sectionId: "mgspatriotfix", fieldId: "AnisotropicFiltering", value: 8 };
    for (const value of [0, 17, 8.5, "8", NaN]) expect(() => preparePatchEdits(result.sources, [{ ...change, value }])).toThrow();
    expect(() => preparePatchEdits(result.sources, [{ ...change, fieldId: "Arbitrary/Injected" }])).toThrow();
    expect(() => preparePatchEdits(result.sources, [change, change])).toThrow("Duplicate");
    expect(() => preparePatchEdits(result.sources, [], ["mgspatriotfix"])).toThrow("already");
  });

  it("keeps unsupported existing values read-only and rejects malformed files", async () => {
    await file("MGS4/scripts/MGSPatriotFix.asi", binaryVersion(0, 2, 1));
    await file("MGSPatriotFix.settings", '[Enhancements && Tweaks]\nCustom Shadow Resolution="8192"\n');
    const result = await readPatchSettings("mgs4", dir);
    expect(result.sections[0]?.fields.find(field => field.id === "ShadowBufferSize")?.readOnly).toBe(true);
    expect(() => preparePatchEdits(result.sources, [{ sectionId: "mgspatriotfix", fieldId: "ShadowBufferSize", value: "2048" }])).toThrow();
    await file("MGSPatriotFix.settings", "[Bad]\nOops");
    expect((await readPatchSettings("mgs4", dir)).sections[0]?.status).toBe("unsupported");
  });

  it("validates SSU sentinel settings and paired dimensions", async () => {
    await file("MGS4/scripts/SunnySideUp.asi", Buffer.from("SunnySideUp 1.0.6\0"));
    await file("MGS4/scripts/SunnySideUp.ini", "[Display]\nWidth=0\nHeight=0\nFieldOfView=AUTO\n");
    const result = await readPatchSettings("mgs4", dir);
    const change = { sectionId: "sunnysideup", fieldId: "Display/FieldOfView", value: "90" };
    expect(preparePatchEdits(result.sources, [change])[0]?.updated.toString()).toContain("FieldOfView=90");
    for (const value of ["29", "141", "NaN", "AUTO\nHack=1"]) expect(() => preparePatchEdits(result.sources, [{ ...change, value }])).toThrow();
    expect(() => preparePatchEdits(result.sources, [{ ...change, fieldId: "Display/Width", value: 1920 }])).toThrow("both");
    expect(preparePatchEdits(result.sources, [{ ...change, fieldId: "Display/Width", value: 1920 }, { ...change, fieldId: "Display/Height", value: 1080 }])).toHaveLength(1);
  });
});
