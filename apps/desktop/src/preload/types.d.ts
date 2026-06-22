import type { CompanionConfig, DashboardStats } from "../shared/types";

declare global {
  interface Window {
    memoryOS: {
      getStats: () => Promise<DashboardStats>;
      pauseTracking: () => Promise<DashboardStats>;
      resumeTracking: () => Promise<DashboardStats>;
      syncNow: () => Promise<DashboardStats>;
      getConfig: () => Promise<CompanionConfig>;
    };
  }
}

export {};
