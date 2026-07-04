import { DeviceEventEmitter, NativeModules, Platform } from "react-native";

import { getApiConfig } from "./api";

export type JarvisAssistantSettings = {
  apiKey?: string;
  apiRoot?: string;
  enabled: boolean;
  manualModeEnabled: boolean;
  openAppOnAnswer: boolean;
  speakAnswers: boolean;
  wakeKeyword?: string;
  wakePhrase?: string;
  wakeSensitivity?: number;
  wakeWordDetectionEnabled: boolean;
  wakeWordAvailable?: boolean;
};

export type JarvisAssistantStatus = {
  enabled: boolean;
  lastAnswer: string;
  lastError: string;
  lastTranscript: string;
  message: string;
  state: string;
  wakeWordAvailable: boolean;
  wakeWordEngine?: string;
  wakeWordReady: boolean;
};

export type JarvisPermissionState = {
  batteryOptimized: boolean;
  microphone: boolean;
  notifications: boolean;
  speechRecognition: boolean;
  wakeWordAvailable: boolean;
  wakeWordEngine: string;
  wakeWordError: string;
  wakeWordReady: boolean;
};

export type JarvisAssistantEvent = {
  answer?: string;
  error?: string;
  status?: JarvisAssistantStatus;
  transcript?: string;
  type: "status" | "transcript" | "result" | "error";
};

type NativeJarvisAssistantModule = {
  getLastResult: () => Promise<{ answer: string; error: string; transcript: string }>;
  getSettings: () => Promise<JarvisAssistantSettings>;
  getStatus: () => Promise<JarvisAssistantStatus>;
  hasRequiredPermissions: () => Promise<JarvisPermissionState>;
  openBatteryOptimizationSettings: () => Promise<boolean>;
  pause: () => Promise<boolean>;
  requestIgnoreBatteryOptimization: () => Promise<boolean>;
  requestMicrophonePermission: () => Promise<boolean>;
  resume: () => Promise<boolean>;
  ask: () => Promise<boolean>;
  start: () => Promise<JarvisAssistantStatus>;
  stop: () => Promise<boolean>;
  testWakeWord: () => Promise<boolean>;
  updateSettings: (settings: Partial<JarvisAssistantSettings>) => Promise<JarvisAssistantSettings>;
};

const nativeModule = NativeModules.JarvisAssistantModule as
  | NativeJarvisAssistantModule
  | undefined;

const defaultSettings: JarvisAssistantSettings = {
  enabled: false,
  manualModeEnabled: true,
  openAppOnAnswer: false,
  speakAnswers: true,
  wakeKeyword: "jarvis",
  wakePhrase: "Hey Jarvis / Jarvis",
  wakeSensitivity: 0.7,
  wakeWordDetectionEnabled: false,
};

const defaultStatus: JarvisAssistantStatus = {
  enabled: false,
  lastAnswer: "",
  lastError: "",
  lastTranscript: "",
  message: "Jarvis assistant is Android-only.",
  state: "unavailable",
  wakeWordAvailable: false,
  wakeWordEngine: "manual",
  wakeWordReady: false,
};

const defaultPermissions: JarvisPermissionState = {
  batteryOptimized: false,
  microphone: false,
  notifications: false,
  speechRecognition: false,
  wakeWordAvailable: false,
  wakeWordEngine: "manual",
  wakeWordError: "Jarvis assistant is Android-only.",
  wakeWordReady: false,
};

const getNativeModule = () => {
  if (Platform.OS !== "android" || !nativeModule) {
    return null;
  }

  return nativeModule;
};

const getApiBridgeConfig = () => {
  const { apiRoot } = getApiConfig();

  return {
    apiKey: process.env.EXPO_PUBLIC_MEMORY_API_KEY || "",
    apiRoot,
  };
};

const withApiBridgeConfig = (settings: Partial<JarvisAssistantSettings>) => ({
  ...getApiBridgeConfig(),
  ...settings,
});

export const getJarvisSettings = async () =>
  (await getNativeModule()?.getSettings()) ?? defaultSettings;

export const updateJarvisSettings = async (settings: Partial<JarvisAssistantSettings>) => {
  const module = getNativeModule();

  if (!module) {
    return { ...defaultSettings, ...settings };
  }

  return module.updateSettings(withApiBridgeConfig(settings));
};

export const getJarvisStatus = async () =>
  (await getNativeModule()?.getStatus()) ?? defaultStatus;

export const getJarvisPermissions = async () =>
  (await getNativeModule()?.hasRequiredPermissions()) ?? defaultPermissions;

export const requestJarvisMicrophonePermission = async () =>
  (await getNativeModule()?.requestMicrophonePermission()) ?? false;

export const startJarvisAssistant = async () => {
  const module = getNativeModule();

  if (!module) {
    return defaultStatus;
  }

  await module.updateSettings(withApiBridgeConfig({ enabled: true }));
  return module.start();
};

export const stopJarvisAssistant = async () => {
  const module = getNativeModule();

  if (!module) {
    return false;
  }

  await module.updateSettings(withApiBridgeConfig({ enabled: false }));
  return module.stop();
};

export const pauseJarvisAssistant = async () =>
  (await getNativeModule()?.pause()) ?? false;

export const resumeJarvisAssistant = async () => {
  const module = getNativeModule();

  if (!module) {
    return false;
  }

  await module.updateSettings(withApiBridgeConfig({ enabled: true }));
  return module.resume();
};

export const askJarvisNow = async () => {
  const module = getNativeModule();

  if (!module) {
    return false;
  }

  await module.updateSettings(withApiBridgeConfig({ enabled: true }));
  return module.ask();
};

export const testJarvisWakeWord = async () => {
  const module = getNativeModule();

  if (!module) {
    return false;
  }

  await module.updateSettings(withApiBridgeConfig({ enabled: true, manualModeEnabled: true }));
  return module.testWakeWord();
};

export const openJarvisBatterySettings = async () =>
  (await getNativeModule()?.openBatteryOptimizationSettings()) ?? false;

export const requestJarvisBatteryOptimizationExemption = async () =>
  (await getNativeModule()?.requestIgnoreBatteryOptimization()) ?? false;

export const getLastJarvisResult = async () =>
  (await getNativeModule()?.getLastResult()) ?? {
    answer: "",
    error: "",
    transcript: "",
  };

export const addJarvisAssistantListener = (
  listener: (event: JarvisAssistantEvent) => void,
) =>
  DeviceEventEmitter.addListener("MemoryOSJarvisEvent", (event) => {
    if (event && typeof event.type === "string") {
      listener(event as JarvisAssistantEvent);
    }
  });
