import { ActivityRepository } from "../db/database.js";
import { desktopLogger } from "./logger.js";
import { ConfigService } from "./config.js";
import { electron } from "../../shared/electron.js";

const SYNC_INTERVAL_MS = 15 * 60 * 1000;
const { app } = electron;

const minutesToHours = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
};

export class SyncService {
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;
  private lastSyncedAt: string | null = null;

  constructor(
    private repository: ActivityRepository,
    private configService: ConfigService
  ) {}

  getLastSyncedAt() {
    return this.lastSyncedAt;
  }

  start() {
    if (this.timer) {
      return;
    }

    desktopLogger.info("sync", "starting sync timer", { intervalMs: SYNC_INTERVAL_MS });
    void this.sync();
    this.timer = setInterval(() => void this.sync(), SYNC_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sync() {
    if (this.syncing) {
      desktopLogger.info("sync", "sync skipped because one is already in progress");
      return;
    }

    const config = this.configService.getConfig();

    if (!config.apiKey || !config.apiUrl) {
      desktopLogger.warn("sync", "sync skipped because api config is incomplete", {
        hasApiUrl: Boolean(config.apiUrl),
        hasApiKey: Boolean(config.apiKey)
      });
      return;
    }

    this.syncing = true;

    try {
      const summaries = this.repository.getUnsyncedDailySummaries();
      desktopLogger.info("sync", "starting sync", {
        summaryCount: Array.isArray(summaries) ? summaries.length : 0
      });

      for (const summary of summaries as Array<{
        date: string;
        coding_minutes: number;
        productive_minutes: number;
        idle_minutes: number;
        productivity_score: number;
      }>) {
        const projects = this.repository.getProjectDurations(summary.date) as Array<{
          projectName: string;
          activeSeconds: number;
        }>;
        const apps = this.repository.getAppDurations(summary.date) as Array<{
          appName: string;
          activeSeconds: number;
        }>;
        const mostActiveProject = projects[0]?.projectName || "Unassigned";
        const mostUsedApp = apps[0]?.appName || "Unknown";
        const content = [
          `Desktop activity summary for ${summary.date}`,
          `Worked ${minutesToHours(summary.productive_minutes)}`,
          `Coding ${minutesToHours(summary.coding_minutes)}`,
          `Idle ${minutesToHours(summary.idle_minutes)}`,
          `Most Active Project: ${mostActiveProject}`,
          `Most Used App: ${mostUsedApp}`,
          "",
          "Projects:",
          ...projects.slice(0, 8).map((project) => `- ${project.projectName}: ${minutesToHours(Math.round(project.activeSeconds / 60))}`),
          "",
          "Apps:",
          ...apps.slice(0, 8).map((app) => `- ${app.appName}: ${minutesToHours(Math.round(app.activeSeconds / 60))}`)
        ].join("\n");

        const projectBreakdown = projects.slice(0, 8).map((project) => ({
          projectName: project.projectName,
          durationMinutes: Math.round(project.activeSeconds / 60)
        }));
        const appBreakdown = apps.slice(0, 8).map((app) => ({
          appName: app.appName,
          durationMinutes: Math.round(app.activeSeconds / 60)
        }));

        const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/api/desktop-activity`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey
          },
          body: JSON.stringify({
            title: `Desktop Activity Summary ${summary.date}`,
            date: summary.date,
            summary: content,
            codingMinutes: summary.coding_minutes,
            productiveMinutes: summary.productive_minutes,
            idleMinutes: summary.idle_minutes,
            productivityScore: summary.productivity_score,
            projectBreakdown,
            appBreakdown,
            source: "desktop-companion",
            deviceLabel: app.getName(),
            capturedAt: new Date().toISOString()
          })
        });

        if (!response.ok) {
          throw new Error(`MemoryOS sync failed with ${response.status}`);
        }

        this.lastSyncedAt = new Date().toISOString();
        this.repository.markSummarySynced(summary.date, this.lastSyncedAt);
        desktopLogger.info("sync", "summary synced", {
          date: summary.date,
          lastSyncedAt: this.lastSyncedAt
        });
      }
      desktopLogger.info("sync", "sync finished", {
        lastSyncedAt: this.lastSyncedAt
      });
    } catch (error) {
      desktopLogger.error("sync", "sync failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      this.syncing = false;
    }
  }
}
