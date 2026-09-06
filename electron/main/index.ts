import { app, BrowserWindow, protocol } from "electron";
import { join } from "node:path";

protocol.registerSchemesAsPrivileged([{ scheme: "hub-asset", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1920, height: 1080, show: false, backgroundColor: "#000000",
    fullscreen: !process.env.HUB_WINDOWED, autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, "../preload/index.js"), sandbox: true, contextIsolation: true },
  });
  win.once("ready-to-show", () => win.show());
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, "../renderer/index.html"));
  return win;
}

app.whenReady().then(() => { createWindow(); });
app.on("window-all-closed", () => app.quit());
