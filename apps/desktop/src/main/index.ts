import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserWindow as BrowserWindowType, Event as ElectronEvent } from "electron";

import { ActivityRepository } from "./db/database.js";
import { registerDashboardIpc } from "./ipc/dashboardIpc.js";
import { ConfigService } from "./services/config.js";
import { desktopLogger } from "./services/logger.js";
import { SyncService } from "./services/sync.js";
import { TrackingService } from "./services/tracker.js";
import { TrayService } from "./services/tray.js";
import { electron } from "../shared/electron.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { BrowserWindow, app } = electron;

let mainWindow: BrowserWindowType | null = null;
let trayService: TrayService | null = null;
let isQuitting = false;
let trackerService: TrackingService | null = null;
let syncService: SyncService | null = null;

const createWindow = () => {
  if (mainWindow) {
    desktopLogger.info("window", "reusing existing window");
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  desktopLogger.info("window", "creating main window");
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    title: "MemoryOS Companion",
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    desktopLogger.info("window", "loading dev server", { url: process.env.VITE_DEV_SERVER_URL });
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    desktopLogger.info("window", "loading packaged renderer");
    void mainWindow.loadFile(path.join(__dirname, "../../renderer/index.html"));
  }

  mainWindow.webContents.on("did-finish-load", () => {
    desktopLogger.info("window", "renderer finished loading");
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    desktopLogger.error("window", "renderer failed to load", { errorCode, errorDescription });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    desktopLogger.error("window", "renderer process exited", {
      reason: details.reason,
      exitCode: details.exitCode
    });
  });

  mainWindow.on("close", (event: ElectronEvent) => {
    if (!isQuitting) {
      desktopLogger.info("window", "close intercepted; hiding to tray");
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    desktopLogger.info("window", "main window closed");
    mainWindow = null;
  });

  return mainWindow;
};

app.on("before-quit", () => {
  isQuitting = true;
  trackerService?.flushForQuit();
  trackerService?.stop();
  syncService?.stop();
  desktopLogger.info("app", "before-quit received");
});

void app.whenReady().then(() => {
  desktopLogger.info("app", "app ready", {
    userData: app.getPath("userData"),
    logFile: desktopLogger.path(),
    isPackaged: app.isPackaged
  });
  const configService = new ConfigService();
  const config = configService.getConfig();
  const repository = new ActivityRepository();
  const tracker = new TrackingService(repository);
  const sync = new SyncService(repository, configService);
  trackerService = tracker;
  syncService = sync;

  desktopLogger.info("config", "loaded companion config", {
    launchAtLogin: config.launchAtLogin,
    hasApiUrl: Boolean(config.apiUrl),
    hasApiKey: Boolean(config.apiKey)
  });

  app.setLoginItemSettings({
    openAtLogin: config.launchAtLogin,
    openAsHidden: true
  });

  registerDashboardIpc({
    repository,
    tracker,
    sync,
    config: configService
  });

  tracker.start();
  sync.start();
  desktopLogger.info("app", "tracker and sync services started");

  trayService = new TrayService(repository, tracker, sync, configService, createWindow);
  trayService.create();
  desktopLogger.info("tray", "tray created");

  tracker.on("activity-written", () => trayService?.updateMenu());
  tracker.on("status-changed", () => trayService?.updateMenu());

  if (!process.argv.includes("--hidden")) {
    createWindow();
  }
});

app.on("activate", () => {
  desktopLogger.info("app", "activate received");
  createWindow();
});

app.on("window-all-closed", () => {
  desktopLogger.info("app", "window-all-closed received", { platform: process.platform });
  if (process.platform !== "darwin") {
    app.quit();
  }
});
