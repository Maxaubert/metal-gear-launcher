import { contextBridge, ipcRenderer } from "electron";
import type { HubApi } from "@shared/ipc";

const api: HubApi = {
  getGameSettings: (gameId, accountId) => ipcRenderer.invoke("hub:settings:get", { gameId, accountId }),
  saveGameSettings: (request) => ipcRenderer.invoke("hub:settings:save", request),
  saveMenuMusic: (request) => ipcRenderer.invoke("hub:music:save", request),
  getMenuMusic: (gameId) => ipcRenderer.invoke("hub:music:get", gameId),
  openMenuMusicFolder: (gameId) => ipcRenderer.invoke("hub:music:openFolder", gameId),
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
  // Sent as a single `{ gameId, ...opts }` object, not two positional args - the main handler's
  // zod schema (`z.object({ gameId, install })`) parses one payload object (see index.ts).
  launch: (gameId, opts) => ipcRenderer.invoke("hub:launch", { gameId, ...opts }),
  quit: () => ipcRenderer.invoke("hub:quit"),
  getUpdate: () => ipcRenderer.invoke("hub:getUpdate"),
  openUpdate: () => ipcRenderer.invoke("hub:openUpdate"),
  getConfig: () => ipcRenderer.invoke("hub:config:get"),
  setConfig: (patch) => ipcRenderer.invoke("hub:config:set", patch),
  pickFolder: () => ipcRenderer.invoke("hub:pickFolder"),
  ready: () => ipcRenderer.invoke("hub:ready"),
  onSelectionOpen: (cb) => {
    const h = () => cb();
    ipcRenderer.on("hub:selectionOpen", h);
    return () => ipcRenderer.off("hub:selectionOpen", h);
  },
};
contextBridge.exposeInMainWorld("hub", api);
