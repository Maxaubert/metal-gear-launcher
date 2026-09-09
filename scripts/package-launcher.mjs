import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const musicRoot = join(root, "resources", "menu-music");
const games = ["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"];
const tracks = games.flatMap(game => {
  try { return readdirSync(join(musicRoot, game), { withFileTypes: true }).filter(file => file.isFile() && /\.mp3$/i.test(file.name)); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
});
const edition = tracks.length ? "Full" : "Lite";
const artifactName = `MetalGearLauncher-${edition}-Setup-x64-\${version}.exe`;
console.log(JSON.stringify({ edition, musicTracks: tracks.length, artifactName }));
if (!process.argv.includes("--dry-run")) {
  const child = spawnSync(process.execPath, [join(root, "node_modules", "electron-builder", "out", "cli", "cli.js"),
    "--win", "nsis", "--publish", "never", `-c.win.artifactName=${artifactName}`], { cwd: root, stdio: "inherit" });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
}
