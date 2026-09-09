import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// Personal music never changes what is shipped, even in a developer checkout
// containing tracks left over from an older Full build.
const artifactName = "MetalGearLauncher-Setup-x64-${version}.exe";
console.log(JSON.stringify({ bundledMusic: false, artifactName }));
if (!process.argv.includes("--dry-run")) {
  const child = spawnSync(process.execPath, [join(root, "node_modules", "electron-builder", "out", "cli", "cli.js"),
    "--win", "nsis", "--publish", "never", `-c.win.artifactName=${artifactName}`], { cwd: root, stdio: "inherit" });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
}
