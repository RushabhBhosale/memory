import { NativeEventEmitter, NativeModules, Platform } from "react-native";

import {
  createMemory,
  createScreenshotInboxItem,
  listScreenshotInbox,
  updateScreenshotInboxItem,
  type ScreenshotInboxItem,
} from "./api";
import { analyzeScreenshot } from "./screenshotIntelligence";
import { extractTextFromScreenshot } from "./screenshotOcr";
import { scheduleScreenshotSavedNotification } from "./notifications";
import { markHomeCacheStale } from "../utils/homeCache";

export type { ScreenshotInboxItem } from "./api";

type LocalScreenshotItem = {
  id: string;
  imageUri: string;
  capturedAt: number;
  processed: boolean;
  dismissed: boolean;
  saveRequested?: boolean;
  synced?: boolean;
  createdAt: number;
};

type ScreenshotWatcherNativeModule = {
  hasPermissions(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  startWatching(): Promise<boolean>;
  stopWatching(): Promise<boolean>;
  listLocalScreenshots(): Promise<LocalScreenshotItem[]>;
  markSynced(id: string): Promise<LocalScreenshotItem | null>;
  markIgnored(id: string): Promise<LocalScreenshotItem | null>;
};

const nativeModule = NativeModules.ScreenshotWatcherModule as
  | ScreenshotWatcherNativeModule
  | undefined;

let hasStarted = false;
let syncInFlight = false;

const toIso = (timestamp: number | string) =>
  new Date(typeof timestamp === "number" ? timestamp : Number(timestamp)).toISOString();

export const hasScreenshotPermissions = async () => {
  if (Platform.OS !== "android" || !nativeModule) {
    return false;
  }

  return nativeModule.hasPermissions();
};

export const requestScreenshotPermissions = async () => {
  if (Platform.OS !== "android" || !nativeModule) {
    return false;
  }

  return nativeModule.requestPermissions();
};

export const syncLocalScreenshotInbox = async () => {
  if (Platform.OS !== "android" || !nativeModule || syncInFlight) {
    return;
  }

  syncInFlight = true;

  try {
    const localItems = await nativeModule.listLocalScreenshots();

    for (const item of localItems) {
      const remote = await createScreenshotInboxItem({
        capturedAt: toIso(item.capturedAt),
        dismissed: item.dismissed,
        imageUri: item.imageUri,
        processed: item.processed,
        source: "android",
      }).catch(() => null);

      if (remote) {
        await nativeModule.markSynced(item.id).catch(() => undefined);

        if (item.dismissed) {
          await updateScreenshotInboxItem(remote._id, { dismissed: true }).catch(() => undefined);
        }

        if (item.saveRequested && !remote.processed && !remote.dismissed) {
          await saveScreenshotToMemory(remote).catch(() => undefined);
        }
      }
    }
  } finally {
    syncInFlight = false;
  }
};

export const startScreenshotWatcher = async () => {
  if (Platform.OS !== "android" || !nativeModule || hasStarted) {
    return false;
  }

  const hasPermission = await nativeModule.hasPermissions();

  if (!hasPermission) {
    return false;
  }

  hasStarted = await nativeModule.startWatching();

  if (hasStarted) {
    const emitter = new NativeEventEmitter(NativeModules.ScreenshotWatcherModule);
    const subscription = emitter.addListener("MemoryOSScreenshotDetected", () => {
      void syncLocalScreenshotInbox();
    });

    void syncLocalScreenshotInbox();

    return Boolean(subscription);
  }

  return false;
};

export const listScreenshots = async () => {
  await syncLocalScreenshotInbox().catch(() => undefined);
  return listScreenshotInbox();
};

export const ignoreScreenshot = async (item: ScreenshotInboxItem) => {
  await updateScreenshotInboxItem(item._id, { dismissed: true });
};

export const deleteScreenshot = async (item: ScreenshotInboxItem) => {
  await updateScreenshotInboxItem(item._id, { dismissed: true });
};

export const saveScreenshotToMemory = async (item: ScreenshotInboxItem) => {
  if (item.processed && item.memoryId) {
    return item;
  }

  const cachedText = item.extractedText?.trim();
  const ocr = cachedText
    ? { confidence: 1, text: cachedText }
    : await extractTextFromScreenshot(item.imageUri);
  const extractedText = ocr.text.trim();
  const analysis =
    item.generatedTitle && item.generatedCategory
      ? {
          category: item.generatedCategory,
          tags: item.generatedTags || [],
          title: item.generatedTitle,
        }
      : await analyzeScreenshot(extractedText);
  const content =
    extractedText ||
    `Screenshot captured at ${new Date(item.capturedAt).toLocaleString()}.`;
  const memory = await createMemory({
    capturedAt: item.capturedAt,
    category: analysis.category,
    content,
    kind: "note",
    screenshotUri: item.imageUri,
    source: "screenshot",
    tags: Array.from(new Set(["screenshot", ...analysis.tags])),
    title: analysis.title || "Screenshot Memory",
  });

  const updated = await updateScreenshotInboxItem(item._id, {
    extractedText,
    generatedCategory: analysis.category,
    generatedTags: analysis.tags,
    generatedTitle: analysis.title,
    memoryId: memory._id,
    processed: true,
  });

  await markHomeCacheStale();
  await scheduleScreenshotSavedNotification(memory.title).catch(() => undefined);

  return updated;
};
