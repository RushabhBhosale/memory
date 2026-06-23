import { EventEmitter } from "node:events";

import { ActivityRepository } from "../db/database.js";
import { electron } from "../../shared/electron.js";
import { classifyProductivity, detectProjectName, normalizeTrackedAppName } from "./classifier.js";
import { desktopLogger } from "./logger.js";
import { formatLocalDateKey, splitRangeByLocalDay } from "../../shared/localTime.js";

const { powerMonitor } = electron;

const TRACK_INTERVAL_MS = 5_000;
const IDLE_THRESHOLD_SECONDS = 5 * 60;

type FlushReason = "checkpoint" | "switch" | "idle" | "pause" | "stop" | "quit" | "suspend" | "lock-screen";

type ActiveSnapshot = {
  appName: string;
  windowTitle: string;
  projectName: string | null;
  startedAt: Date;
};

type ActiveWindowModule = {
  activeWindow?: () => Promise<{
    owner?: { name?: string | null } | null;
    title?: string | null;
  } | null>;
  default?: () => Promise<{
    owner?: { name?: string | null } | null;
    title?: string | null;
  } | null>;
};

let activeWindowLoader:
  | (() => Promise<{
      owner?: { name?: string | null } | null;
      title?: string | null;
    } | null>)
  | null
  | undefined;

const getActiveWindow = async () => {
  if (activeWindowLoader === undefined) {
    try {
      const module = (await import("get-windows")) as ActiveWindowModule;
      activeWindowLoader = module.activeWindow ?? module.default ?? null;
      desktopLogger.info("tracker", "loaded get-windows native module");
    } catch (error) {
      activeWindowLoader = null;
      desktopLogger.warn("tracker", "get-windows failed to load; tracking will stay idle until it is available", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (!activeWindowLoader) {
    return null;
  }

  return activeWindowLoader();
};

export class TrackingService extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private current: ActiveSnapshot | null = null;
  private tracking = true;
  private readonly handleSuspend = () => {
    desktopLogger.info("tracker", "system suspend detected; flushing current session");
    this.flushCurrent(new Date(), false, "suspend");
    this.current = null;
  };
  private readonly handleLockScreen = () => {
    desktopLogger.info("tracker", "lock screen detected; flushing current session");
    this.flushCurrent(new Date(), false, "lock-screen");
    this.current = null;
  };

  constructor(private repository: ActivityRepository) {
    super();
  }

  isTracking() {
    return this.tracking;
  }

  start() {
    if (this.timer) {
      return;
    }

    this.tracking = true;
    desktopLogger.info("tracker", "tracker started", { intervalMs: TRACK_INTERVAL_MS });
    powerMonitor.on("suspend", this.handleSuspend);
    powerMonitor.on("lock-screen", this.handleLockScreen);
    void this.tickSafely();
    this.timer = setInterval(() => void this.tickSafely(), TRACK_INTERVAL_MS);
  }

  pause() {
    this.flushCurrent(new Date(), false, "pause");
    this.current = null;
    this.tracking = false;
    desktopLogger.info("tracker", "tracker paused");
    this.emit("status-changed");
  }

  resume() {
    this.tracking = true;
    this.current = null;
    desktopLogger.info("tracker", "tracker resumed");
    void this.tickSafely();
    this.emit("status-changed");
  }

  stop() {
    this.flushCurrent(new Date(), false, "stop");
    this.current = null;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    powerMonitor.removeListener("suspend", this.handleSuspend);
    powerMonitor.removeListener("lock-screen", this.handleLockScreen);

    desktopLogger.info("tracker", "tracker stopped");
  }

  private async tick() {
    if (!this.tracking) {
      return;
    }

    const idleSeconds = powerMonitor.getSystemIdleTime();
    const now = new Date();
    const active = await getActiveWindow();

    if (!active) {
      desktopLogger.warn("tracker", "no active window returned from native module");
      return;
    }

    const appName = normalizeTrackedAppName(active?.owner?.name || "Unknown");
    const windowTitle = active?.title || "";
    const projectName = detectProjectName(appName, windowTitle);
    const changed =
      !this.current ||
      this.current.appName !== appName ||
      this.current.windowTitle !== windowTitle ||
      this.current.projectName !== projectName;

    if (idleSeconds > IDLE_THRESHOLD_SECONDS) {
      desktopLogger.info("tracker", "idle threshold reached", { idleSeconds });
      this.flushCurrent(now, true, "idle");
      this.current = null;
      return;
    }

    if (changed) {
      desktopLogger.info("tracker", "active window changed", {
        appName,
        projectName,
        windowTitle: windowTitle.slice(0, 120)
      });
      this.flushCurrent(now, false, "switch");
      this.current = {
        appName,
        windowTitle,
        projectName,
        startedAt: now,
      };
      return;
    }

    this.flushCurrent(now, false, "checkpoint");

    if (this.current) {
      this.current.startedAt = now;
    }
  }

  private async tickSafely() {
    try {
      await this.tick();
    } catch (error) {
      desktopLogger.warn("tracker", "activity tracking tick failed; will retry on the next interval", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  flushForQuit() {
    this.flushCurrent(new Date(), false, "quit");
    this.current = null;
  }

  flushForSync() {
    if (!this.current) {
      return;
    }

    const now = new Date();
    this.flushCurrent(now, false, "checkpoint");

    if (this.current) {
      this.current.startedAt = now;
    }
  }

  private flushCurrent(endedAt: Date, idle = false, reason: FlushReason = "checkpoint") {
    if (!this.current) {
      return;
    }

    if (endedAt <= this.current.startedAt) {
      return;
    }

    const productivity = classifyProductivity(
      this.current.appName,
      this.current.windowTitle,
    );
    const touchedDateKeys = new Set<string>();
    let totalDurationSeconds = 0;

    for (const segment of splitRangeByLocalDay(this.current.startedAt, endedAt)) {
      const durationSeconds = Math.max(
        0,
        Math.round((segment.endedAt.getTime() - segment.startedAt.getTime()) / 1000),
      );

      if (durationSeconds <= 0) {
        continue;
      }

      totalDurationSeconds += durationSeconds;
      touchedDateKeys.add(segment.dateKey);

      this.repository.insertActivityLog({
        appName: this.current.appName,
        windowTitle: this.current.windowTitle,
        projectName: this.current.projectName,
        startedAt: segment.startedAt.toISOString(),
        endedAt: segment.endedAt.toISOString(),
        durationSeconds,
        activeDurationSeconds: idle ? 0 : durationSeconds,
        idleDurationSeconds: idle ? durationSeconds : 0,
        productivity: productivity.productivity,
        productivityScore: productivity.productivityScore,
      });
    }

    for (const dateKey of touchedDateKeys) {
      this.repository.refreshDailySummary(dateKey);
    }

    if (reason !== "checkpoint" && totalDurationSeconds > 0) {
      desktopLogger.info("tracker", "activity written", {
        appName: this.current.appName,
        projectName: this.current.projectName,
        durationSeconds: totalDurationSeconds,
        idle,
        reason,
        dateKey: formatLocalDateKey(this.current.startedAt)
      });
    }

    this.emit("activity-written");
  }
}
