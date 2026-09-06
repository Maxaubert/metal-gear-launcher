import { contextBridge, ipcRenderer } from "electron";
import type { HubApi } from "@shared/ipc";

const api: HubApi = {
  getState: () => ipcRenderer.invoke("hub:getState"),
  extract: (target) => ipcRenderer.invoke("hub:extract", target),
  setSteamPath: (p) => ipcRenderer.invoke("hub:setSteamPath", p),
  onExtractProgress: (cb) => {
    const h = (_: unknown, p: unknown) => cb(p as never);
    ipcRenderer.on("hub:extract:progress", h);
    return () => ipcRenderer.off("hub:extract:progress", h);
  },
  launch: (gameId, opts) => ipcRenderer.invoke("hub:launch", gameId, opts),
  quit: () => ipcRenderer.invoke("hub:quit"),
  getConfig: () => ipcRenderer.invoke("hub:config:get"),
  setConfig: (patch) => ipcRenderer.invoke("hub:config:set", patch),
  pickFolder: () => ipcRenderer.invoke("hub:pickFolder"),
};
contextBridge.exposeInMainWorld("hub", api);
