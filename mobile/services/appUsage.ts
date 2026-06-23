import { NativeModules, Platform } from "react-native";

export type AppUsageItem = {
  packageName: string;
  appName: string;
  totalTimeMs: number;
  lastUsedTime: number;
};

type AppUsageNativeModule = {
  hasUsageAccessPermission: () => Promise<boolean>;
  openUsageAccessSettings: () => void;
  getAppUsageStats: (startTime: number, endTime: number) => Promise<AppUsageItem[]>;
};

const nativeModule = NativeModules.AppUsageModule as AppUsageNativeModule | undefined;

const ensureAndroidModule = () => {
  if (Platform.OS !== "android") {
    return null;
  }

  if (!nativeModule) {
    throw new Error("App usage native module is unavailable. Rebuild the Android app.");
  }

  return nativeModule;
};

export const hasUsageAccessPermission = async () => {
  if (Platform.OS !== "android") {
    return false;
  }

  return (await ensureAndroidModule()?.hasUsageAccessPermission()) ?? false;
};

export const openUsageAccessSettings = () => {
  if (Platform.OS !== "android") {
    return;
  }

  ensureAndroidModule()?.openUsageAccessSettings();
};

export const getAppUsageStats = async (startTime: number, endTime: number) => {
  if (Platform.OS !== "android") {
    return [];
  }

  const items = (await ensureAndroidModule()?.getAppUsageStats(startTime, endTime)) ?? [];
  return items
    .filter((item) => item.totalTimeMs >= 60_000)
    .sort((a, b) => b.totalTimeMs - a.totalTimeMs);
};

export const filterUsageItemsToWindow = (
  items: AppUsageItem[],
  startTime: number,
  endTime: number,
) =>
  items.filter(
    (item) =>
      item.totalTimeMs >= 60_000 &&
      item.lastUsedTime >= startTime &&
      item.lastUsedTime <= endTime,
  );

export const formatUsageDuration = (totalTimeMs: number) => {
  const totalMinutes = Math.max(0, Math.round(totalTimeMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${minutes}m`;
};

export const getTodayRange = (now = new Date()) => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { startTime: start.getTime(), endTime: now.getTime() };
};

export const getThisWeekRange = (now = new Date()) => {
  const start = new Date(now);
  const day = start.getDay();
  const offset = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - offset);
  start.setHours(0, 0, 0, 0);
  return { startTime: start.getTime(), endTime: now.getTime() };
};

export const getThisMonthRange = (now = new Date()) => {
  const start = new Date(now);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return { startTime: start.getTime(), endTime: now.getTime() };
};
