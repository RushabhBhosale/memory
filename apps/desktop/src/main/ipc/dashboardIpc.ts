import type { ActivityRepository } from "../db/database.js";
import type { ConfigService } from "../services/config.js";
import type { SyncService } from "../services/sync.js";
import { desktopLogger } from "../services/logger.js";
import type { TrackingService } from "../services/tracker.js";
import { electron } from "../../shared/electron.js";

const { ipcMain } = electron;

export const registerDashboardIpc = ({
  repository,
  tracker,
  sync,
  config
}: {
  repository: ActivityRepository;
  tracker: TrackingService;
  sync: SyncService;
  config: ConfigService;
}) => {
  ipcMain.handle("dashboard:get-stats", () => {
    desktopLogger.info("ipc", "dashboard:get-stats invoked", {
      tracking: tracker.isTracking(),
      lastSyncedAt: sync.getLastSyncedAt()
    });
    return repository.getDashboardStats(tracker.isTracking(), sync.getLastSyncedAt());
  });

  ipcMain.handle("tracking:pause", () => {
    desktopLogger.info("ipc", "tracking:pause invoked");
    tracker.pause();
    return repository.getDashboardStats(tracker.isTracking(), sync.getLastSyncedAt());
  });

  ipcMain.handle("tracking:resume", () => {
    desktopLogger.info("ipc", "tracking:resume invoked");
    tracker.resume();
    return repository.getDashboardStats(tracker.isTracking(), sync.getLastSyncedAt());
  });

  ipcMain.handle("sync:run", async () => {
    desktopLogger.info("ipc", "sync:run invoked");
    tracker.flushForSync();
    await sync.sync();
    return repository.getDashboardStats(tracker.isTracking(), sync.getLastSyncedAt());
  });

  ipcMain.handle("config:get", () => {
    desktopLogger.info("ipc", "config:get invoked");
    return config.getConfig();
  });
};
