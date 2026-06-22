import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ActivityItem, DesktopActivity, Memory, Project } from "../services/api";

const HOME_RECENT_MEMORIES_KEY = "home:recentMemories";
const HOME_PROJECTS_KEY = "home:projects";
const HOME_TASKS_KEY = "home:tasks";
const HOME_LAST_SYNCED_AT_KEY = "home:lastSyncedAt";
const HOME_DESKTOP_ACTIVITY_KEY = "home:desktopActivity";

export const HOME_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

export type HomeCacheData = {
  activity: ActivityItem[];
  desktopActivity: DesktopActivity[];
  memories: Memory[];
  projects: Project[];
  lastSyncedAt: number | null;
};

const readJson = async <T>(key: string, fallback: T): Promise<T> => {
  const value = await AsyncStorage.getItem(key);

  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const readHomeCache = async (): Promise<HomeCacheData | null> => {
  const [activity, desktopActivity, memories, projects, lastSyncedAtValue] = await Promise.all([
    readJson<ActivityItem[]>(HOME_TASKS_KEY, []),
    readJson<DesktopActivity[]>(HOME_DESKTOP_ACTIVITY_KEY, []),
    readJson<Memory[]>(HOME_RECENT_MEMORIES_KEY, []),
    readJson<Project[]>(HOME_PROJECTS_KEY, []),
    AsyncStorage.getItem(HOME_LAST_SYNCED_AT_KEY),
  ]);
  const lastSyncedAt = lastSyncedAtValue ? Number.parseInt(lastSyncedAtValue, 10) : null;
  const hasCachedData = activity.length > 0 || desktopActivity.length > 0 || memories.length > 0 || projects.length > 0;

  if (!hasCachedData) {
    return null;
  }

  return {
    activity,
    desktopActivity,
    memories,
    projects,
    lastSyncedAt: Number.isFinite(lastSyncedAt) ? lastSyncedAt : null,
  };
};

export const writeHomeCache = async (data: {
  activity: ActivityItem[];
  desktopActivity: DesktopActivity[];
  memories: Memory[];
  projects: Project[];
  syncedAt?: number;
}) => {
  const syncedAt = data.syncedAt || Date.now();

  await Promise.all([
    AsyncStorage.setItem(HOME_DESKTOP_ACTIVITY_KEY, JSON.stringify(data.desktopActivity)),
    AsyncStorage.setItem(HOME_RECENT_MEMORIES_KEY, JSON.stringify(data.memories)),
    AsyncStorage.setItem(HOME_TASKS_KEY, JSON.stringify(data.activity)),
    AsyncStorage.setItem(HOME_PROJECTS_KEY, JSON.stringify(data.projects)),
    AsyncStorage.setItem(HOME_LAST_SYNCED_AT_KEY, String(syncedAt)),
  ]);
};

export const isHomeCacheFresh = (lastSyncedAt: number | null) =>
  Boolean(lastSyncedAt && Date.now() - lastSyncedAt < HOME_CACHE_MAX_AGE_MS);
