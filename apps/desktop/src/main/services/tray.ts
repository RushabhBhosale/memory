import type { Tray as TrayType } from "electron";

import type { ActivityRepository } from "../db/database.js";
import type { ConfigService } from "./config.js";
import type { SyncService } from "./sync.js";
import type { TrackingService } from "./tracker.js";
import { electron } from "../../shared/electron.js";

const { Menu, Tray, app, nativeImage, shell } = electron;

export class TrayService {
  private tray: TrayType | null = null;

  constructor(
    private repository: ActivityRepository,
    private tracker: TrackingService,
    private sync: SyncService,
    private config: ConfigService,
    private openDashboard: () => void
  ) {}

  create() {
    const image = nativeImage.createEmpty();
    this.tray = new Tray(image);
    this.tray.setToolTip("MemoryOS Companion");
    this.updateMenu();
  }

  updateMenu() {
    if (!this.tray) {
      return;
    }

    const stats = this.repository.getDashboardStats(this.tracker.isTracking(), this.sync.getLastSyncedAt());
    const config = this.config.getConfig();

    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "MemoryOS Companion", enabled: false },
        { label: `Status: ${this.tracker.isTracking() ? "Running" : "Paused"}`, enabled: false },
        { label: `Today's Coding Time: ${stats.todayCodingMinutes}m`, enabled: false },
        { label: `Today's Productive Time: ${stats.todayProductiveMinutes}m`, enabled: false },
        { type: "separator" },
        { label: "Open Dashboard", click: this.openDashboard },
        { label: "Open MemoryOS", click: () => void shell.openExternal(config.dashboardUrl) },
        { type: "separator" },
        {
          label: "Pause Tracking",
          enabled: this.tracker.isTracking(),
          click: () => {
            this.tracker.pause();
            this.updateMenu();
          }
        },
        {
          label: "Resume Tracking",
          enabled: !this.tracker.isTracking(),
          click: () => {
            this.tracker.resume();
            this.updateMenu();
          }
        },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() }
      ])
    );
  }
}
