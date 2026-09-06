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
  onSelectGame: (cb) => {
    const h = (_: unknown, id: unknown) => cb(id as never);
    ipcRenderer.on("hub:selectGame", h);
    return () => ipcRenderer.off("hub:selectGame", h);
  },
  // `opts` threads through the `HubApi.launch` addition documented in `shared/ipc.ts`,
  // matching the plan's own Task 10 spec for the `hub:launch` payload (see that file's comment).
  launch: (gameId, opts) => ipcRenderer.invoke("hub:launch", gameId, opts),
  quit: () => ipcRenderer.invoke("hub:quit"),
  getConfig: () => ipcRenderer.invoke("hub:config:get"),
  setConfig: (patch) => ipcRenderer.invoke("hub:config:set", patch),
  pickFolder: () => ipcRenderer.invoke("hub:pickFolder"),
};
contextBridge.exposeInMainWorld("hub", api);
