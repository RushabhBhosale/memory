import { electron } from "../shared/electron.js";

const { contextBridge, ipcRenderer } = electron;

console.info("[memoryos-desktop] preload initialized");

contextBridge.exposeInMainWorld("memoryOS", {
  getStats: () => ipcRenderer.invoke("dashboard:get-stats"),
  pauseTracking: () => ipcRenderer.invoke("tracking:pause"),
  resumeTracking: () => ipcRenderer.invoke("tracking:resume"),
  syncNow: () => ipcRenderer.invoke("sync:run"),
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config: unknown) => ipcRenderer.invoke("config:save", config)
});
