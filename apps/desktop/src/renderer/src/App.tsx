import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import type { CompanionConfig, DashboardStats } from "../../shared/types";
import "./styles.css";

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
};

const StatCard = ({ label, value, detail }: { label: string; value: string; detail?: string }) => (
  <section className="stat-card">
    <p className="stat-label">{label}</p>
    <strong>{value}</strong>
    {detail ? <span>{detail}</span> : null}
  </section>
);

const BarList = ({
  items,
  labelKey,
  valueKey
}: {
  items: Array<Record<string, string | number | null>>;
  labelKey: string;
  valueKey: string;
}) => {
  const max = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1);

  return (
    <div className="bar-list">
      {items.length ? (
        items.map((item) => {
          const value = Number(item[valueKey] || 0);
          const label = String(item[labelKey] || "Unknown");

          return (
            <div className="bar-row" key={label}>
              <div className="bar-meta">
                <span>{label}</span>
                <strong>{formatMinutes(value)}</strong>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
              </div>
            </div>
          );
        })
      ) : (
        <p className="empty">No activity tracked yet.</p>
      )}
    </div>
  );
};

const Trend = ({ items }: { items: DashboardStats["weeklyTrend"] }) => {
  const max = Math.max(...items.map((item) => item.codingMinutes), 1);

  return (
    <div className="trend">
      {items.map((item) => (
        <div className="trend-column" key={item.date}>
          <div
            className="trend-bar"
            style={{ height: `${Math.max(8, (item.codingMinutes / max) * 120)}px` }}
            title={`${item.date}: ${formatMinutes(item.codingMinutes)}`}
          />
          <span>{item.date.slice(5)}</span>
        </div>
      ))}
    </div>
  );
};

function App() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [config, setConfig] = useState<CompanionConfig | null>(null);
  const [draftConfig, setDraftConfig] = useState<CompanionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);

      if (!window.memoryOS) {
        throw new Error("Desktop bridge is unavailable. Open the companion in Electron instead of a regular browser tab.");
      }

      const [nextStats, nextConfig] = await Promise.all([
        window.memoryOS.getStats(),
        window.memoryOS.getConfig()
      ]);
      setStats(nextStats);
      setConfig(nextConfig);
      setDraftConfig(nextConfig);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load dashboard stats.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);

    return () => clearInterval(timer);
  }, []);

  const status = useMemo(() => {
    if (!stats) {
      return "Loading";
    }

    return stats.isTracking ? "Running" : "Paused";
  }, [stats]);

  const saveConfig = async () => {
    if (!draftConfig) {
      return;
    }

    try {
      setSavingConfig(true);
      setConfigMessage(null);
      const saved = await window.memoryOS.saveConfig({
        ...draftConfig,
        apiUrl: draftConfig.apiUrl.trim(),
        apiKey: draftConfig.apiKey.trim(),
        dashboardUrl: draftConfig.dashboardUrl.trim()
      });
      setConfig(saved);
      setDraftConfig(saved);
      setConfigMessage("Settings saved.");
    } catch (caught) {
      setConfigMessage(caught instanceof Error ? caught.message : "Unable to save settings.");
    } finally {
      setSavingConfig(false);
    }
  };

  if (error && !stats) {
    return (
      <main className="shell loading">
        <div className="error-panel">
          <strong>MemoryOS Companion could not finish loading.</strong>
          <p>{error}</p>
          <button onClick={() => void refresh()}>Retry</button>
        </div>
      </main>
    );
  }

  if (loading || !stats) {
    return <main className="shell loading">Loading MemoryOS Companion...</main>;
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">MemoryOS Companion</p>
          <h1>Work activity dashboard</h1>
          <p className="subtitle">
            Tracks app usage locally, summarizes work patterns, and syncs only aggregate summaries.
          </p>
        </div>
        <div className="status-card">
          <span>Status</span>
          <strong>{status}</strong>
          <p>{stats.lastSyncedAt ? `Last synced ${new Date(stats.lastSyncedAt).toLocaleTimeString()}` : "Not synced yet"}</p>
        </div>
      </header>

      <section className="actions">
        <button onClick={() => void refresh()}>Refresh</button>
        <button onClick={() => void window.memoryOS.syncNow().then(setStats)}>Sync now</button>
        {stats.isTracking ? (
          <button onClick={() => void window.memoryOS.pauseTracking().then(setStats)}>Pause tracking</button>
        ) : (
          <button onClick={() => void window.memoryOS.resumeTracking().then(setStats)}>Resume tracking</button>
        )}
      </section>

      <section className="panel settings-panel">
        <div className="panel-header">
          <h2>Companion Settings</h2>
          <span>{config?.apiKey ? "Configured" : "Needs API key"}</span>
        </div>
        {draftConfig ? (
          <div className="settings-grid">
            <label className="field">
              <span>API URL</span>
              <input
                type="url"
                value={draftConfig.apiUrl}
                onChange={(event) =>
                  setDraftConfig({ ...draftConfig, apiUrl: event.target.value })
                }
                placeholder="https://memory-green-kappa.vercel.app"
              />
            </label>
            <label className="field">
              <span>API Key</span>
              <input
                type="password"
                value={draftConfig.apiKey}
                onChange={(event) =>
                  setDraftConfig({ ...draftConfig, apiKey: event.target.value })
                }
                placeholder="Enter production x-api-key"
              />
            </label>
            <label className="field">
              <span>Dashboard URL</span>
              <input
                type="url"
                value={draftConfig.dashboardUrl}
                onChange={(event) =>
                  setDraftConfig({ ...draftConfig, dashboardUrl: event.target.value })
                }
                placeholder="https://memory-green-kappa.vercel.app"
              />
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draftConfig.launchAtLogin}
                onChange={(event) =>
                  setDraftConfig({ ...draftConfig, launchAtLogin: event.target.checked })
                }
              />
              <span>Launch at login</span>
            </label>
          </div>
        ) : null}
        <div className="settings-actions">
          <button disabled={!draftConfig || savingConfig} onClick={() => void saveConfig()}>
            {savingConfig ? "Saving..." : "Save settings"}
          </button>
          <p className="settings-copy">
            Packaged app builds use saved local settings instead of your repo `.env`.
          </p>
        </div>
        {configMessage ? <p className="settings-message">{configMessage}</p> : null}
      </section>

      <section className="stats-grid">
        <StatCard label="Coding today" value={formatMinutes(stats.todayCodingMinutes)} detail={`${formatMinutes(stats.weeklyCodingMinutes)} this week`} />
        <StatCard label="Productive today" value={formatMinutes(stats.todayProductiveMinutes)} detail={`${formatMinutes(stats.monthlyCodingMinutes)} coding this month`} />
        <StatCard label="Idle today" value={formatMinutes(stats.todayIdleMinutes)} />
        <StatCard label="Productivity score" value={`${stats.productivityScore}%`} />
      </section>

      <section className="panel-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Top Projects</h2>
            <span>Today</span>
          </div>
          <BarList items={stats.topProjects} labelKey="projectName" valueKey="durationMinutes" />
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Top Apps</h2>
            <span>Today</span>
          </div>
          <BarList items={stats.topApps} labelKey="appName" valueKey="durationMinutes" />
        </section>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Weekly Coding Trend</h2>
          <span>Local only</span>
        </div>
        <Trend items={stats.weeklyTrend} />
      </section>

      <section className="privacy">
        <strong>Privacy</strong>
        <span>No clipboard, passwords, emails, browser content, or file contents are collected.</span>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
