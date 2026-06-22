export type ActivityLogInput = {
  appName: string;
  windowTitle: string;
  projectName: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  activeDurationSeconds: number;
  idleDurationSeconds: number;
  productivity: "productive" | "distracting" | "neutral";
  productivityScore: number;
};

export type DashboardStats = {
  todayCodingMinutes: number;
  weeklyCodingMinutes: number;
  monthlyCodingMinutes: number;
  todayProductiveMinutes: number;
  todayIdleMinutes: number;
  productivityScore: number;
  topProjects: Array<{ projectName: string; durationMinutes: number }>;
  topApps: Array<{ appName: string; durationMinutes: number; lastOpened: string | null }>;
  weeklyTrend: Array<{ date: string; codingMinutes: number; productiveMinutes: number }>;
  monthlyTrend: Array<{ date: string; codingMinutes: number; productiveMinutes: number }>;
  isTracking: boolean;
  lastSyncedAt: string | null;
};

export type CompanionConfig = {
  apiUrl: string;
  apiKey: string;
  dashboardUrl: string;
  launchAtLogin: boolean;
};
