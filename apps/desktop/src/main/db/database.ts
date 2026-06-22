import path from "node:path";
import Database from "better-sqlite3";

import { isCodingApp } from "../services/classifier.js";
import type { ActivityLogInput, DashboardStats } from "../../shared/types.js";
import { electron } from "../../shared/electron.js";
import { addLocalDays, formatLocalDateKey, getLocalDayRange, startOfLocalDay } from "../../shared/localTime.js";

const { app } = electron;

export class ActivityRepository {
  private db: Database.Database;

  constructor(dbPath = path.join(app.getPath("userData"), "memoryos-companion.sqlite")) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name TEXT NOT NULL,
        window_title TEXT NOT NULL,
        project_name TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL,
        active_duration_seconds INTEGER NOT NULL DEFAULT 0,
        idle_duration_seconds INTEGER NOT NULL DEFAULT 0,
        productivity TEXT NOT NULL DEFAULT 'neutral',
        productivity_score INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_activity_started_at ON activity_logs(started_at);
      CREATE INDEX IF NOT EXISTS idx_activity_project_name ON activity_logs(project_name);
      CREATE INDEX IF NOT EXISTS idx_activity_app_name ON activity_logs(app_name);
      CREATE INDEX IF NOT EXISTS idx_activity_synced_at ON activity_logs(synced_at);

      CREATE TABLE IF NOT EXISTS daily_summaries (
        date TEXT PRIMARY KEY,
        coding_minutes INTEGER NOT NULL DEFAULT 0,
        productive_minutes INTEGER NOT NULL DEFAULT 0,
        idle_minutes INTEGER NOT NULL DEFAULT 0,
        productivity_score INTEGER NOT NULL DEFAULT 0,
        summary_text TEXT NOT NULL DEFAULT '',
        synced_at TEXT,
        updated_at TEXT NOT NULL
      );
    `);
  }

  insertActivityLog(input: ActivityLogInput) {
    this.db
      .prepare(
        `INSERT INTO activity_logs (
          app_name,
          window_title,
          project_name,
          started_at,
          ended_at,
          duration_seconds,
          active_duration_seconds,
          idle_duration_seconds,
          productivity,
          productivity_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.appName,
        input.windowTitle,
        input.projectName,
        input.startedAt,
        input.endedAt,
        input.durationSeconds,
        input.activeDurationSeconds,
        input.idleDurationSeconds,
        input.productivity,
        input.productivityScore
      );
  }

  refreshDailySummary(dateKey = formatLocalDateKey()) {
    const { start, end } = getLocalDayRange(dateKey);
    const rows = this.db
      .prepare(
        `SELECT app_name, productivity, productivity_score,
          SUM(active_duration_seconds) AS activeSeconds,
          SUM(idle_duration_seconds) AS idleSeconds
        FROM activity_logs
        WHERE started_at BETWEEN ? AND ?
        GROUP BY app_name, productivity, productivity_score`
      )
      .all(start.toISOString(), end.toISOString()) as Array<{
      app_name: string;
      productivity: string;
      productivity_score: number;
      activeSeconds: number;
      idleSeconds: number;
    }>;
    const codingSeconds = rows
      .filter((row) => isCodingApp(row.app_name))
      .reduce((sum, row) => sum + Number(row.activeSeconds || 0), 0);
    const productiveSeconds = rows
      .filter((row) => row.productivity === "productive")
      .reduce((sum, row) => sum + Number(row.activeSeconds || 0), 0);
    const idleSeconds = rows.reduce((sum, row) => sum + Number(row.idleSeconds || 0), 0);
    const productivityScore = rows.reduce(
      (sum, row) => sum + Number(row.productivity_score || 0) * Math.round(Number(row.activeSeconds || 0) / 60),
      0
    );

    this.db
      .prepare(
        `INSERT INTO daily_summaries (
          date, coding_minutes, productive_minutes, idle_minutes, productivity_score, synced_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?)
        ON CONFLICT(date) DO UPDATE SET
          coding_minutes = excluded.coding_minutes,
          productive_minutes = excluded.productive_minutes,
          idle_minutes = excluded.idle_minutes,
          productivity_score = excluded.productivity_score,
          synced_at = CASE
            WHEN daily_summaries.coding_minutes != excluded.coding_minutes
              OR daily_summaries.productive_minutes != excluded.productive_minutes
              OR daily_summaries.idle_minutes != excluded.idle_minutes
              OR daily_summaries.productivity_score != excluded.productivity_score
            THEN NULL
            ELSE daily_summaries.synced_at
          END,
          updated_at = excluded.updated_at`
      )
      .run(
        dateKey,
        Math.round(codingSeconds / 60),
        Math.round(productiveSeconds / 60),
        Math.round(idleSeconds / 60),
        productivityScore,
        new Date().toISOString()
      );
  }

  getDashboardStats(isTracking: boolean, lastSyncedAt: string | null): DashboardStats {
    const today = startOfLocalDay();
    const weekStart = addLocalDays(today, -6).toISOString();
    const monthStart = addLocalDays(today, -29).toISOString();
    const todayKey = formatLocalDateKey(today);

    this.refreshDailySummary(todayKey);

    const summary = this.db
      .prepare("SELECT * FROM daily_summaries WHERE date = ?")
      .get(todayKey) as
      | {
          coding_minutes: number;
          productive_minutes: number;
          idle_minutes: number;
          productivity_score: number;
        }
      | undefined;

    const codingRange = (fromIso: string) => {
      const rows = this.db
        .prepare(
          `SELECT app_name, SUM(active_duration_seconds) AS seconds
          FROM activity_logs
          WHERE started_at >= ?
          GROUP BY app_name`
        )
        .all(fromIso) as Array<{ app_name: string; seconds: number }>;

      return Math.round(
        rows
          .filter((row) => isCodingApp(row.app_name))
          .reduce((sum, row) => sum + Number(row.seconds || 0), 0) / 60
      );
    };

    const topProjects = this.db
      .prepare(
        `SELECT COALESCE(project_name, 'Unassigned') AS projectName,
          SUM(active_duration_seconds) AS seconds
        FROM activity_logs
        WHERE started_at >= ?
        GROUP BY COALESCE(project_name, 'Unassigned')
        ORDER BY seconds DESC
        LIMIT 8`
      )
      .all(today.toISOString()) as Array<{ projectName: string; seconds: number }>;

    const topApps = this.db
      .prepare(
        `SELECT app_name AS appName,
          SUM(active_duration_seconds) AS seconds,
          MAX(ended_at) AS lastOpened
        FROM activity_logs
        WHERE started_at >= ?
        GROUP BY app_name
        ORDER BY seconds DESC
        LIMIT 8`
      )
      .all(today.toISOString()) as Array<{ appName: string; seconds: number; lastOpened: string | null }>;

    const trend = (fromIso: string) =>
      (this.db
        .prepare(
          `SELECT date, coding_minutes AS codingMinutes, productive_minutes AS productiveMinutes
          FROM daily_summaries
          WHERE date >= ?
          ORDER BY date ASC`
        )
        .all(formatLocalDateKey(new Date(fromIso))) as Array<{
        date: string;
        codingMinutes: number;
        productiveMinutes: number;
      }>);

    const todayProductiveMinutes = summary?.productive_minutes || 0;
    const todayIdleMinutes = summary?.idle_minutes || 0;
    const productiveDenominator = Math.max(todayProductiveMinutes + todayIdleMinutes, 1);

    return {
      todayCodingMinutes: summary?.coding_minutes || 0,
      weeklyCodingMinutes: codingRange(weekStart),
      monthlyCodingMinutes: codingRange(monthStart),
      todayProductiveMinutes,
      todayIdleMinutes,
      productivityScore: Math.round((todayProductiveMinutes / productiveDenominator) * 100),
      topProjects: topProjects.map((row) => ({
        projectName: row.projectName,
        durationMinutes: Math.round(Number(row.seconds || 0) / 60)
      })),
      topApps: topApps.map((row) => ({
        appName: row.appName,
        durationMinutes: Math.round(Number(row.seconds || 0) / 60),
        lastOpened: row.lastOpened
      })),
      weeklyTrend: trend(weekStart),
      monthlyTrend: trend(monthStart),
      isTracking,
      lastSyncedAt
    };
  }

  getUnsyncedDailySummaries(limit = 14) {
    return this.db
      .prepare(
        `SELECT date, coding_minutes, productive_minutes, idle_minutes, productivity_score, summary_text
        FROM daily_summaries
        WHERE synced_at IS NULL
        ORDER BY date DESC
        LIMIT ?`
      )
      .all(limit);
  }

  getProjectDurations(date: string) {
    const { start, end } = getLocalDayRange(date);

    return this.db
      .prepare(
        `SELECT COALESCE(project_name, 'Unassigned') AS projectName,
          SUM(active_duration_seconds) AS activeSeconds
        FROM activity_logs
        WHERE started_at BETWEEN ? AND ?
        GROUP BY COALESCE(project_name, 'Unassigned')
        ORDER BY activeSeconds DESC`
      )
      .all(start.toISOString(), end.toISOString());
  }

  getAppDurations(date: string) {
    const { start, end } = getLocalDayRange(date);

    return this.db
      .prepare(
        `SELECT app_name AS appName,
          SUM(active_duration_seconds) AS activeSeconds
        FROM activity_logs
        WHERE started_at BETWEEN ? AND ?
        GROUP BY app_name
        ORDER BY activeSeconds DESC`
      )
      .all(start.toISOString(), end.toISOString());
  }

  markSummarySynced(date: string, syncedAt: string) {
    this.db.prepare("UPDATE daily_summaries SET synced_at = ? WHERE date = ?").run(syncedAt, date);
  }
}
