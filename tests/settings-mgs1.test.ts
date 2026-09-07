import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readMgs1Settings, prepareMgs1Edits } from "../electron/main/settings/mgs1";
import { decodeMgs1Save, MGS1_BLOCK_SIZE, MGS1_PAYLOAD_SIZE } from "../electron/main/settings/mgs1Codec";

const roots: string[] = [];
const ACCOUNT = "76561197960265770";

// Synthetic schema-sized payload and a minimal PSB resource table. No game data.
function saveFixture() {
  const payload = Buffer.alloc(MGS1_PAYLOAD_SIZE);
  payload.writeUInt32LE(0x10014);
  payload.writeUInt32LE(0x1001f, MGS1_BLOCK_SIZE);
  payload.writeUInt32LE(2, 4160);
  payload.writeUInt32LE(1, 4192);
  payload.writeUInt32LE(1, 4196);
  payload[4234] = 1;
  payload.writeUInt32LE(100, 4428);
  payload.writeUInt32LE(100, 4432);
  payload[4444] = 1;
  payload.writeUInt32LE(1, 4636);
  payload.write("unrelated save data", MGS1_BLOCK_SIZE + 8000);
  const metadata = Buffer.alloc(80);
  metadata.write("PSB\0");
  metadata.writeUInt16LE(3, 4);
  metadata.writeUInt32LE(44, 8);
  metadata.writeUInt32LE(44, 24);
  metadata.writeUInt32LE(48, 28);
  metadata.writeUInt32LE(64, 32);
  Buffer.from([0x0d, 1, 0x0d, 0]).copy(metadata, 44);
  Buffer.from([0x0d, 1, 0x0d, 16]).copy(metadata, 48);
  metadata.write("opaque", 52);
  createHash("md5").update(payload).digest().copy(metadata, 64);
  const header = Buffer.alloc(8);
  header.writeUInt32LE(payload.length);
  header.writeUInt32LE(metadata.length, 4);
  return { original: Buffer.concat([header, payload, metadata]), payload, metadata };
}

async function fixture(account = "42") {
  const root = await mkdtemp(join(tmpdir(), "hub-mgs1-"));
  roots.push(root);
  const install = join(root, "game");
  const steam = join(root, "steam");
  const remote = join(steam, "userdata", account, "2131630", "remote");
  await Promise.all([mkdir(join(install, "winbackup"), { recursive: true }), mkdir(remote, { recursive: true })]);
  await writeFile(join(install, "winbackup", "savecfg.txt"), "BOOT_FULLSCREEN = 0\r\nLAST_CLIENT_SIZE_X=3840\r\n");
  const data = saveFixture();
  await writeFile(join(remote, "data_008_0000.bin"), data.original);
  await writeFile(join(install, "winbackup", "meta_008_0000.bin"), data.metadata);
  return { root, install, steam, remote, ...data };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected temporary directory");
    await rm(root, { recursive: true, force: true });
  }
});

describe("MGS1 native settings", () => {
  it("prepares verified common-field edits, updates the paired digest and preserves every unrelated byte", async () => {
    const f = await fixture();
    const settings = await readMgs1Settings(f.install, undefined, f.steam);
    expect(settings.accountId).toBe(ACCOUNT);
    const fields = settings.sections.find(section => section.id === "native-game")!.fields;
    expect(fields.find(field => field.id === "volumeUi")).toMatchObject({ value: 100, defaultValue: 100, step: 10 });
    expect(fields.map(field => field.id)).not.toContain("volumeBgm");
    const writes = prepareMgs1Edits(settings.sources, [
      { sectionId: "native-game", fieldId: "volumeUi", value: 40 },
      { sectionId: "native-game", fieldId: "muteGame", value: true },
      { sectionId: "native-game", fieldId: "languageLauncher", value: 4 },
    ]);
    expect(writes).toHaveLength(2);
    const cloud = writes.find(write => write.path.endsWith("data_008_0000.bin"))!;
    const decoded = decodeMgs1Save(cloud.updated);
    const expected = Buffer.from(f.payload);
    expected.writeUInt32LE(40, 4432);
    expected[4445] = 1;
    expected.writeUInt32LE(4, 4636);
    expect(decoded.payload.equals(expected)).toBe(true);
    expect(decoded.metadata.subarray(0, 64)).toEqual(f.metadata.subarray(0, 64));
    expect(writes.find(write => write.path.endsWith("meta_008_0000.bin"))!.updated).toEqual(decoded.metadata);
    expect((await readFile(join(f.remote, "data_008_0000.bin"))).equals(f.original)).toBe(true);
    expect(await readFile(join(f.install, "winbackup", "meta_008_0000.bin"))).toEqual(f.metadata);
  });

  it("requires account selection and leaves an unmatched local mirror untouched", async () => {
    const f = await fixture();
    const second = join(f.steam, "userdata", "43", "2131630", "remote");
    await mkdir(second, { recursive: true });
    await writeFile(join(second, "data_008_0000.bin"), f.original);
    expect((await readMgs1Settings(f.install, undefined, f.steam)).accountId).toBeUndefined();
    await expect(readMgs1Settings(f.install, "76561197960265799", f.steam)).rejects.toThrow(/selected Steam account/);
    await writeFile(join(f.install, "winbackup", "meta_008_0000.bin"), Buffer.from("different account"));
    const settings = await readMgs1Settings(f.install, ACCOUNT, f.steam);
    const writes = prepareMgs1Edits(settings.sources, [{ sectionId: "native-game", fieldId: "volumeGame", value: 50 }]);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.path).toContain("userdata");
  });

  it("rejects corrupt payloads, malformed resource tables and unsupported versions", () => {
    const { original } = saveFixture();
    const corrupt = Buffer.from(original);
    corrupt[9000] = 1;
    expect(() => decodeMgs1Save(corrupt)).toThrow(/checksum/);
    expect(() => decodeMgs1Save(original.subarray(0, 20))).toThrow(/length/);
    const badMeta = Buffer.from(original);
    badMeta.writeUInt32LE(0xffffffff, 8 + MGS1_PAYLOAD_SIZE + 24);
    expect(() => decodeMgs1Save(badMeta)).toThrow(/metadata array/);
    const badVersion = Buffer.from(original);
    badVersion.writeUInt16LE(4, 8 + MGS1_PAYLOAD_SIZE + 4);
    expect(() => decodeMgs1Save(badVersion)).toThrow(/metadata/);
  });

  it("validates field values and native resolution combinations before preparing writes", async () => {
    const f = await fixture();
    const settings = await readMgs1Settings(f.install, undefined, f.steam);
    for (const value of [-10, 110, 42, "50"]) expect(() => prepareMgs1Edits(settings.sources, [{ sectionId: "native-game", fieldId: "volumeUi", value }])).toThrow();
    expect(() => prepareMgs1Edits(settings.sources, [{ sectionId: "native-game", fieldId: "muteGame", value: 1 }])).toThrow(/boolean/);
    expect(() => prepareMgs1Edits(settings.sources, [{ sectionId: "native-game", fieldId: "unknown", value: 1 }])).toThrow(/Unknown/);
    expect(() => prepareMgs1Edits(settings.sources, [
      { sectionId: "native-game", fieldId: "screenSize", value: 4 },
      { sectionId: "native-game", fieldId: "resolution", value: 2 },
    ])).toThrow(/Original resolution/);
  });

  it("preserves window formatting and returns no writes for unchanged values", async () => {
    const f = await fixture();
    const settings = await readMgs1Settings(f.install, undefined, f.steam);
    expect(prepareMgs1Edits(settings.sources, [{ sectionId: "native-game", fieldId: "volumeUi", value: 100 }])).toEqual([]);
    const writes = prepareMgs1Edits(settings.sources, [{ sectionId: "native-window", fieldId: "BOOT_FULLSCREEN", value: true }]);
    expect(writes[0]!.updated.toString()).toBe("BOOT_FULLSCREEN = 1\r\nLAST_CLIENT_SIZE_X=3840\r\n");
  });

  it("rejects a Steam account junction that escapes the userdata root", async () => {
    const f = await fixture();
    await symlink(f.root, join(f.steam, "userdata", "44"), process.platform === "win32" ? "junction" : "dir");
    const settings = await readMgs1Settings(f.install, undefined, f.steam);
    expect(settings.accounts.map(account => account.id)).toEqual([ACCOUNT]);
  });
});
