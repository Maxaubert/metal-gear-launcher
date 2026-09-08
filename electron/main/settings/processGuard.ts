import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function assertNoGameProcesses(installDir: string, result: unknown, executableNames: Set<string>): void {
  if (!result || typeof result !== "object") throw new Error("Could not verify whether the game is running. Try saving again.");
  const processes: unknown[] = Array.isArray(result) ? result : [result];
  if (!processes.length) throw new Error("Could not verify whether the game is running. Try saving again.");
  const root = `${resolve(installDir).toLowerCase()}${sep}`;
  for (const item of processes) {
    if (!item || typeof item !== "object" || !("Name" in item) || typeof item.Name !== "string") throw new Error("Invalid process information; settings were not saved.");
    const path = "ExecutablePath" in item ? item.ExecutablePath : undefined;
    const inside = typeof path === "string" && resolve(path).toLowerCase().startsWith(root);
    // Elevated processes can hide ExecutablePath from a non-elevated hub. Do not
    // silently discard them when their name matches an installed game executable.
    const hiddenMatch = (path === null || path === undefined || path === "") && executableNames.has(item.Name.toLowerCase());
    if (inside || hiddenMatch) throw new Error(`Close ${item.Name || "the game and its configuration tools"} before saving settings. Your edits are still pending.`);
  }
}

async function installedExecutableNames(installDir: string): Promise<Set<string>> {
  const names = new Set<string>();
  for (const folder of ["", "plugins", "scripts", "Launcher", "MGS4", "MGS1", "mgspw"]) {
    try {
      const entries = await readdir(join(installDir, folder), { withFileTypes: true });
      for (const entry of entries) if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) names.add(entry.name.toLowerCase());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return names;
}

export async function requireGameClosed(installDir: string): Promise<void> {
  if (process.platform !== "win32") return;
  const names = await installedExecutableNames(installDir);
  const { stdout } = await execFileAsync(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), ["-NoProfile", "-NonInteractive", "-Command",
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object Name,ExecutablePath | ConvertTo-Json -Compress"],
  { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  const result: unknown = JSON.parse(stdout.trim() || "null");
  assertNoGameProcesses(installDir, result, names);
}
