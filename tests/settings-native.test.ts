import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { readNativeSettings, prepareNativeEdits } from "../electron/main/settings/native";
import { decodeUsersv, editUsersv, usersvCrc16 } from "../electron/main/settings/usersv";

const ACCOUNT = "76561198000000001";
const roots: string[] = [];
async function fixture(game = "mgs3", account = ACCOUNT) {
  const root = await mkdtemp(join(tmpdir(), "hub-native-"));
  roots.push(root);
  const dir = join(root, `${game}_savedata_win`, account, "launcher");
  await mkdir(dir, { recursive: true });
  return { root, dir };
}

// Hand-made format fixture with a deterministic key stream unrelated to any game
// key. Includes an opaque field outside the UI's known range to catch data loss.
function usersv(values: Record<number, number> = {}) {
  const plain = Buffer.alloc(4096);
  plain.write("MGSS");
  plain.writeUInt32LE(123456, 12);
  plain.writeInt32LE(987654, 16 + 80 * 4);
  for (const [index, value] of Object.entries(values)) plain.writeInt32LE(value, 16 + Number(index) * 4);
  plain.writeUInt16LE(usersvCrc16(plain.subarray(16)), 4);
  const encrypted = Buffer.from(plain);
  for (let offset = 0; offset < 4096; offset += 4) {
    if (offset === 12) continue;
    const ordinal = offset < 12 ? offset / 4 : offset / 4 - 1;
    const key = Math.imul((ordinal + 123456) % 512, 0x9e3779b1) >>> 0;
    encrypted.writeUInt32LE((plain.readUInt32LE(offset) ^ key) >>> 0, offset);
  }
  return { encrypted, plain };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected temporary directory");
    await rm(root, { recursive: true, force: true });
  }
});

describe("native usersv format", () => {
  it("uses the standard CRC16/ARC check value and preserves unrelated bytes on edit", () => {
    expect(usersvCrc16(Buffer.from("123456789"))).toBe(0xbb3d);
    const { encrypted, plain } = usersv({ 3: 10, 9: -40 });
    expect(decodeUsersv(encrypted)).toEqual(plain);
    const updated = decodeUsersv(editUsersv(encrypted, new Map([[3, 6]])));
    expect(updated.readInt32LE(28)).toBe(6);
    expect(updated.subarray(12, 28)).toEqual(plain.subarray(12, 28));
    expect(updated.subarray(32)).toEqual(plain.subarray(32));
  });
  it("rejects truncated, corrupt and unsupported ciphertext without repairing it", () => {
    const { encrypted } = usersv();
    expect(() => decodeUsersv(encrypted.subarray(0, 100))).toThrow(/length/);
    encrypted[100] = encrypted[100]! ^ 1;
    expect(() => decodeUsersv(encrypted)).toThrow(/checksum/);
    expect(() => decodeUsersv(Buffer.alloc(4096))).toThrow(/signature/);
    expect(() => editUsersv(usersv().encrypted, new Map([[256, 1]]))).toThrow(/Invalid/);
  });
});

describe("native settings adapter", () => {
  it("preserves unknown JSON data, validates edits and never writes installed files", async () => {
    const { root, dir } = await fixture();
    const original = Buffer.from('\uFEFF{"keyList":["languageLauncher","opaque"],"valueList":["1","keep"],"future":{"a":1}}\r\n');
    await writeFile(join(dir, "launcher_sv"), original);
    const result = await readNativeSettings("mgs3", root);
    expect(result.accountId).toBe(ACCOUNT);
    const edits = prepareNativeEdits(result.sources, [{ sectionId: "native-launcher", fieldId: "languageLauncher", value: 2 }]);
    expect(edits).toHaveLength(1);
    expect(edits[0]!.updated.toString()).toContain('"valueList":["2","keep"]');
    expect(edits[0]!.updated.toString()).toContain('"future":{"a":1}');
    expect(await readFile(join(dir, "launcher_sv"))).toEqual(original);
    expect(() => prepareNativeEdits(result.sources, [{ sectionId: "native-launcher", fieldId: "opaque", value: 1 }])).toThrow(/Unknown/);
    expect(() => prepareNativeEdits(result.sources, [{ sectionId: "native-launcher", fieldId: "launcherMasterVolume", value: 11 }])).toThrow(/range/);
  });
  it("requires explicit account choice when multiple accounts exist", async () => {
    const { root } = await fixture();
    await mkdir(join(root, "mgs3_savedata_win", "76561198000000002"));
    const result = await readNativeSettings("mgs3", root);
    expect(result.accounts).toHaveLength(2);
    expect(result.accountId).toBeUndefined();
    expect(result.sources).toHaveLength(0);
    await expect(readNativeSettings("mgs3", root, "76561198000000003")).rejects.toThrow(/selected Steam account/);
  });
  it("distinguishes corrupt settings from missing setup and rejects duplicate JSON keys", async () => {
    const { root, dir } = await fixture();
    await writeFile(join(dir, "launcher_sv"), '{"keyList":["x","x"],"valueList":["1","2"]}');
    const result = await readNativeSettings("mgs3", root);
    expect(result.sections.map(section => section.status)).toEqual(["unsupported", "needsSetup"]);
  });
  it("synchronizes MG12 wallpaper position in its two different native value orders", async () => {
    const { root, dir } = await fixture("mg12");
    await writeFile(join(dir, "launcher_sv"), '{"keyList":["WallAlign","opaque"],"valueList":["1","keep"]}');
    await writeFile(join(dir, "usersv"), usersv({ 0: 1, 1: 0, 2: 2, 3: 10 }).encrypted);
    const result = await readNativeSettings("mg12", root);
    const screenFields = result.sections.flatMap(section => section.fields).filter(field => field.category === "Screen");
    expect(screenFields.map(field => field.label)).toEqual(["Display Area", "Wallpaper", "Windowed Mode"]);
    expect(screenFields.find(field => field.id === "WallType")?.options?.[1]?.label).toBe("Wallpaper 1");
    const edits = prepareNativeEdits(result.sources, [{ sectionId: "native-game", fieldId: "WallAlign", value: 1 }]);
    expect(edits).toHaveLength(2);
    expect(decodeUsersv(edits.find(edit => edit.path.endsWith("usersv"))!.updated).readInt32LE(20)).toBe(1);
    expect(JSON.parse(edits.find(edit => edit.path.endsWith("launcher_sv"))!.updated.toString()).valueList).toEqual(["0", "keep"]);
  });
  it("syncs custom MGS3 graphics and blocks unsupported texture and resolution combinations", async () => {
    const { root, dir } = await fixture();
    await writeFile(join(dir, "launcher_sv"), '{"keyList":[],"valueList":[]}');
    await writeFile(join(dir, "usersv"), usersv({ 2: 2, 3: 10 }).encrypted);
    const result = await readNativeSettings("mgs3", root);
    const edits = prepareNativeEdits(result.sources, [{ sectionId: "native-game", fieldId: "HiresoRender", value: 1 }]);
    const doc = JSON.parse(edits.find(edit => edit.path.endsWith("launcher_sv"))!.updated.toString());
    expect(doc.valueList[doc.keyList.indexOf("HiresoPreset")]).toBe("2");
    expect(doc.valueList[doc.keyList.indexOf("HiresoRender")]).toBe("1");
    expect(() => prepareNativeEdits(result.sources, [{ sectionId: "native-game", fieldId: "HiresoRender", value: 3 }])).toThrow(/texture/);
    expect(() => prepareNativeEdits(result.sources, [{ sectionId: "native-game", fieldId: "HiresoTexture", value: 1 }])).toThrow(/read-only/);
  });
  it("synchronizes Volume 2 audio and window values without changing unrelated fields", async () => {
    const { root, dir } = await fixture("mgspw");
    await writeFile(join(dir, "launcher_sv"), '{"keyList":[],"valueList":[]}');
    await writeFile(join(dirname(dir), "usersv"), usersv({ 0: 2, 1: 5, 4: 1280, 5: 720, 9: 5 }).encrypted);
    const result = await readNativeSettings("mgspw", root);
    const edits = prepareNativeEdits(result.sources, [
      { sectionId: "native-game", fieldId: "SndMasterVol", value: 7 },
      { sectionId: "native-game", fieldId: "WindowMode", value: true },
    ]);
    expect(edits).toHaveLength(2);
    const decoded = decodeUsersv(edits.find(edit => edit.path.endsWith("usersv"))!.updated);
    expect(decoded.readInt32LE(20)).toBe(7);
    expect(decoded.readInt32LE(28)).toBe(1);
    expect(decoded.readInt32LE(32)).toBe(1280);
    const doc = JSON.parse(edits.find(edit => edit.path.endsWith("launcher_sv"))!.updated.toString());
    expect(doc.valueList[doc.keyList.indexOf("launcherMasterVolume")]).toBe("7");
    expect(doc.valueList[doc.keyList.indexOf("WindowMode")]).toBe("1");
    expect(() => prepareNativeEdits(result.sources, [{ sectionId: "native-game", fieldId: "SndVolBGM", value: 7 }])).toThrow(/Unknown/);
    expect(() => prepareNativeEdits(result.sources, [{ sectionId: "native-game", fieldId: "CtrlType", value: 5 }])).toThrow(/Invalid/);
  });
  it("allows MGS4 automatic controller and mirrors its native music channel", async () => {
    const { root, dir } = await fixture("mgs4");
    await writeFile(join(dir, "launcher_sv"), '{"keyList":[],"valueList":[]}');
    await writeFile(join(dirname(dir), "usersv"), usersv({ 0: 2, 1: 5, 9: 5 }).encrypted);
    const result = await readNativeSettings("mgs4", root);
    const edits = prepareNativeEdits(result.sources, [
      { sectionId: "native-game", fieldId: "CtrlType", value: 5 },
      { sectionId: "native-game", fieldId: "SndVolBGM", value: 7 },
    ]);
    const decoded = decodeUsersv(edits.find(edit => edit.path.endsWith("usersv"))!.updated);
    expect(decoded.readInt32LE(16)).toBe(5);
    expect(decoded.readInt32LE(52)).toBe(7);
    const doc = JSON.parse(edits.find(edit => edit.path.endsWith("launcher_sv"))!.updated.toString());
    expect(doc.valueList[doc.keyList.indexOf("launcherVolumeBGM")]).toBe("7");
    expect(result.sections.flatMap(section => section.fields).find(field => field.id === "CtrlType")!.defaultValue).toBe(5);
  });
  it("disables mirrored edits if the launcher document is unavailable", async () => {
    const { root, dir } = await fixture("mgspw");
    await writeFile(join(dirname(dir), "usersv"), usersv({ 0: 2, 1: 5 }).encrypted);
    const result = await readNativeSettings("mgspw", root);
    expect(() => prepareNativeEdits(result.sources, [{ sectionId: "native-game", fieldId: "SndMasterVol", value: 7 }])).toThrow(/read-only/);
  });
  it("synchronizes Peace Walker preset dimensions while preserving its window mode", async () => {
    const { root, dir } = await fixture("mgspw");
    await writeFile(join(dir, "launcher_sv"), '{"keyList":[],"valueList":[]}');
    await writeFile(join(dirname(dir), "usersv"), usersv({ 0: 2, 1: 5, 3: 1, 4: 1280, 5: 720 }).encrypted);
    const result = await readNativeSettings("mgspw", root);
    const edits = prepareNativeEdits(result.sources, [{ sectionId: "native-game", fieldId: "WindowSizeMode", value: 3 }]);
    const decoded = decodeUsersv(edits.find(edit => edit.path.endsWith("usersv"))!.updated);
    expect(decoded.readInt32LE(28)).toBe(1);
    expect(decoded.readInt32LE(32)).toBe(2560);
    expect(decoded.readInt32LE(36)).toBe(1440);
    expect(decoded.readInt32LE(92)).toBe(3);
    const doc = JSON.parse(edits.find(edit => edit.path.endsWith("launcher_sv"))!.updated.toString());
    expect(doc.valueList[doc.keyList.indexOf("WindowSizeW")]).toBe("2560");
  });
  it("writes Peace Walker custom graphics and its effective native values together", async () => {
    const { root, dir } = await fixture("mgspw");
    await writeFile(join(dir, "launcher_sv"), '{"keyList":[],"valueList":[]}');
    const result = await readNativeSettings("mgspw", root);
    const edits = prepareNativeEdits(result.sources, [{ sectionId: "native-launcher", fieldId: "CustomResolution", value: 1 }]);
    const doc = JSON.parse(edits[0]!.updated.toString());
    expect(doc.valueList[doc.keyList.indexOf("GameResolution")]).toBe("1");
    expect(doc.valueList[doc.keyList.indexOf("HiresoPreset")]).toBe("2");
    expect(() => prepareNativeEdits(result.sources, [{ sectionId: "native-launcher", fieldId: "CustomResolution", value: 2 }])).toThrow(/Invalid/);
  });
  it("does not activate unknown sibling graphics values through a related edit", async () => {
    const { root, dir } = await fixture("mgspw");
    await writeFile(join(dir, "launcher_sv"), '{"keyList":["CustomMovie"],"valueList":["99"]}');
    const result = await readNativeSettings("mgspw", root);
    expect(() => prepareNativeEdits(result.sources, [{ sectionId: "native-launcher", fieldId: "CustomResolution", value: 1 }])).toThrow(/Invalid/);
    const mgs3 = await fixture();
    await writeFile(join(mgs3.dir, "launcher_sv"), '{"keyList":[],"valueList":[]}');
    await writeFile(join(mgs3.dir, "usersv"), usersv({ 2: 2, 3: 10, 11: 99 }).encrypted);
    const other = await readNativeSettings("mgs3", mgs3.root);
    expect(() => prepareNativeEdits(other.sources, [{ sectionId: "native-game", fieldId: "HiresoMovie", value: 1 }])).toThrow(/Invalid/);
  });
  it("applies display-aware MGS3 presets atomically and permits Original reset with matching individual defaults", async () => {
    const { root, dir } = await fixture();
    await writeFile(join(dir, "launcher_sv"), '{"keyList":["HiresoRender","HiresoUpScale","HiresoMovie"],"valueList":["1","2","0"]}');
    await writeFile(join(dir, "usersv"), usersv({ 2: 2, 3: 10 }).encrypted);
    const result = await readNativeSettings("mgs3", root, undefined, { width: 3840, height: 2160, label: "Test display" });
    const presetOptions = result.sections.flatMap(section => section.fields).find(field => field.id === "HiresoPreset")!.options!;
    expect(presetOptions.find(option => option.value === 1)!.fieldValues).toEqual({ HiresoRender: 1, HiresoUpScale: 3, HiresoMovie: 1, HiresoTexture: 0 });
    expect(presetOptions.find(option => option.value === 2)!.fieldValues).toEqual({ HiresoRender: 1, HiresoUpScale: 2, HiresoMovie: 0, HiresoTexture: 0 });
    const edits = prepareNativeEdits(result.sources, [{ sectionId: "native-launcher", fieldId: "HiresoPreset", value: 1 }]);
    const decoded = decodeUsersv(edits.find(edit => edit.path.endsWith("usersv"))!.updated);
    expect([11, 12, 13, 14].map(index => decoded.readInt32LE(16 + index * 4))).toEqual([1, 3, 1, 0]);
    const doc = JSON.parse(edits.find(edit => edit.path.endsWith("launcher_sv"))!.updated.toString());
    expect(doc.valueList[doc.keyList.indexOf("HiresoPreset")]).toBe("1");
    expect(doc.valueList[doc.keyList.indexOf("HiresoUpScale")]).toBe("2");
    const custom = prepareNativeEdits(result.sources, [{ sectionId: "native-launcher", fieldId: "HiresoPreset", value: 2 }]);
    const restored = decodeUsersv(custom.find(edit => edit.path.endsWith("usersv"))!.updated);
    expect([11, 12, 13, 14].map(index => restored.readInt32LE(16 + index * 4))).toEqual([1, 2, 0, 0]);
    expect(() => prepareNativeEdits(result.sources, [{ sectionId: "native-launcher", fieldId: "HiresoPreset", value: 3 }])).toThrow(/Invalid/);
    expect(() => prepareNativeEdits(result.sources, [
      { sectionId: "native-launcher", fieldId: "HiresoPreset", value: 0 },
      { sectionId: "native-game", fieldId: "HiresoRender", value: 0 },
    ])).not.toThrow();
  });
  it("uses native Peace Walker preset rules and limits choices to the actual display", async () => {
    const { root, dir } = await fixture("mgspw");
    await writeFile(join(dir, "launcher_sv"), '{"keyList":[],"valueList":[]}');
    const result = await readNativeSettings("mgspw", root, undefined, { width: 1920, height: 1080, label: "Test display" });
    const presetOptions = result.sections.flatMap(section => section.fields).find(field => field.id === "HiresoPreset")!.options!;
    expect(presetOptions.find(option => option.value === 1)!.fieldValues).toEqual({ CustomResolution: 1, CustomUpscale: 1, CustomMovie: 0 });
    expect(presetOptions.find(option => option.value === 3)!.fieldValues).toEqual({ CustomResolution: 1, CustomUpscale: 1, CustomMovie: 1 });
    const edits = prepareNativeEdits(result.sources, [{ sectionId: "native-launcher", fieldId: "HiresoPreset", value: 3 }]);
    const doc = JSON.parse(edits[0]!.updated.toString());
    expect(doc.valueList[doc.keyList.indexOf("HiresoPreset")]).toBe("3");
    expect(["GameResolution", "GameUpscale", "GameMovie"].map(key => doc.valueList[doc.keyList.indexOf(key)])).toEqual(["1", "1", "1"]);
    expect(() => prepareNativeEdits(result.sources, [{ sectionId: "native-launcher", fieldId: "CustomUpscale", value: 3 }])).toThrow(/Invalid/);
  });
  it("preserves Peace Walker's remembered custom settings when selecting an automatic preset", async () => {
    const { root, dir } = await fixture("mgspw");
    await writeFile(join(dir, "launcher_sv"), '{"keyList":["CustomResolution","CustomUpscale","CustomMovie"],"valueList":["1","3","1"]}');
    const result = await readNativeSettings("mgspw", root, undefined, { width: 3840, height: 2160, label: "Test display" });
    const edits = prepareNativeEdits(result.sources, [{ sectionId: "native-launcher", fieldId: "HiresoPreset", value: 0 }]);
    const doc = JSON.parse(edits[0]!.updated.toString());
    expect(["CustomResolution", "CustomUpscale", "CustomMovie"].map(key => doc.valueList[doc.keyList.indexOf(key)])).toEqual(["1", "3", "1"]);
    expect(["GameResolution", "GameUpscale", "GameMovie"].map(key => doc.valueList[doc.keyList.indexOf(key)])).toEqual(["0", "0", "0"]);
    const pending = prepareNativeEdits(result.sources, [
      { sectionId: "native-launcher", fieldId: "CustomMovie", value: 0 },
      { sectionId: "native-launcher", fieldId: "HiresoPreset", value: 3 },
    ]);
    const pendingDoc = JSON.parse(pending[0]!.updated.toString());
    expect(pendingDoc.valueList[pendingDoc.keyList.indexOf("CustomMovie")]).toBe("0");
    expect(pendingDoc.valueList[pendingDoc.keyList.indexOf("GameMovie")]).toBe("1");
  });
  it("saves pending MGS3 custom edits separately from a subsequently selected automatic preset", async () => {
    const { root, dir } = await fixture();
    await writeFile(join(dir, "launcher_sv"), '{"keyList":["HiresoRender","HiresoUpScale"],"valueList":["0","0"]}');
    await writeFile(join(dir, "usersv"), usersv({ 2: 2, 3: 10 }).encrypted);
    const result = await readNativeSettings("mgs3", root, undefined, { width: 3840, height: 2160, label: "Test display" });
    const edits = prepareNativeEdits(result.sources, [
      { sectionId: "native-game", fieldId: "HiresoRender", value: 0 },
      { sectionId: "native-game", fieldId: "HiresoUpScale", value: 2 },
      { sectionId: "native-launcher", fieldId: "HiresoPreset", value: 1 },
    ]);
    const doc = JSON.parse(edits.find(edit => edit.path.endsWith("launcher_sv"))!.updated.toString());
    expect(doc.valueList[doc.keyList.indexOf("HiresoRender")]).toBe("0");
    expect(doc.valueList[doc.keyList.indexOf("HiresoUpScale")]).toBe("2");
    const decoded = decodeUsersv(edits.find(edit => edit.path.endsWith("usersv"))!.updated);
    expect([11, 12].map(index => decoded.readInt32LE(16 + index * 4))).toEqual([1, 3]);
  });
  it("writes MGS4 native window dimensions in both files and preserves fullscreen dimensions", async () => {
    const { root, dir } = await fixture("mgs4");
    await writeFile(join(dir, "launcher_sv"), '{"keyList":["ResolutionFullW","ResolutionFullH"],"valueList":["3840","2160"]}');
    await writeFile(join(dirname(dir), "usersv"), usersv({ 0: 5, 1: 5 }).encrypted);
    const result = await readNativeSettings("mgs4", root, undefined, { width: 3840, height: 2160, label: "Test display" });
    expect(result.sections.flatMap(section => section.fields).find(field => field.id === "MonitorIndex")!.options).toEqual([{ value: 0, label: "Display 1" }]);
    expect(result.sections.flatMap(section => section.fields).find(field => field.id === "WindowMode")!.options).toEqual([{ value: false, label: "Borderless Window" }, { value: true, label: "Windowed" }]);
    const edits = prepareNativeEdits(result.sources, [
      { sectionId: "native-launcher", fieldId: "ScreenResolution", value: 12 },
      { sectionId: "native-game", fieldId: "WindowMode", value: true },
    ]);
    const doc = JSON.parse(edits.find(edit => edit.path.endsWith("launcher_sv"))!.updated.toString());
    expect(doc.valueList[doc.keyList.indexOf("ResolutionWindowW")]).toBe("1920");
    expect(doc.valueList[doc.keyList.indexOf("ResolutionFullW")]).toBe("3840");
    expect(doc.keyList).not.toContain("WindowSizeW");
    expect(doc.keyList).not.toContain("ScreenResolution");
    const decoded = decodeUsersv(edits.find(edit => edit.path.endsWith("usersv"))!.updated);
    expect(decoded.readInt32LE(32)).toBe(1920);
    expect(decoded.readInt32LE(36)).toBe(1080);
    expect(() => prepareNativeEdits(result.sources, [
      { sectionId: "native-launcher", fieldId: "ScreenResolution", value: 2 },
      { sectionId: "native-game", fieldId: "WindowMode", value: true },
    ])).toThrow(/unavailable/);
  });
  it("rejects a save-directory junction escaping the installation", async () => {
    const { root: outside } = await fixture();
    const root = await mkdtemp(join(tmpdir(), "hub-native-"));
    roots.push(root);
    await symlink(join(outside, "mgs3_savedata_win"), join(root, "mgs3_savedata_win"), "junction");
    await expect(readNativeSettings("mgs3", root)).rejects.toThrow(/leaves/);
  });
});
