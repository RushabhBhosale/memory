import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AppUsageItem } from "../services/appUsage";

const APP_USAGE_CACHE_KEY = "appUsage:summary";

export type AppUsageSummary = {
  today: AppUsageItem[];
  week: AppUsageItem[];
  month: AppUsageItem[];
  updatedAt: number;
};

export const readAppUsageCache = async (): Promise<AppUsageSummary | null> => {
  const value = await AsyncStorage.getItem(APP_USAGE_CACHE_KEY);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as AppUsageSummary;
  } catch {
    return null;
  }
};

export const writeAppUsageCache = async (summary: AppUsageSummary) => {
  await AsyncStorage.setItem(APP_USAGE_CACHE_KEY, JSON.stringify(summary));
};
