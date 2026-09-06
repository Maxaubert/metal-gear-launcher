import { contextBridge } from "electron";
contextBridge.exposeInMainWorld("hub", { version: "0.1.0" });
