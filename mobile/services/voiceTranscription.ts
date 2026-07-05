import { DeviceEventEmitter, NativeModules, Platform } from "react-native";

export type VoiceTranscriptionResult = {
  audioFileDeleted?: boolean;
  audioUri?: string | null;
  source?: string;
  transcript: string;
};

type NativeVoiceNoteModule = {
  cancelTranscription: () => Promise<boolean>;
  captureWithSystemPrompt: (languageTag?: string | null) => Promise<VoiceTranscriptionResult>;
  hasAudioPermission: () => Promise<boolean>;
  hasRecognitionSupport: () => Promise<boolean>;
  requestAudioPermission: () => Promise<boolean>;
  startTranscription: (languageTag?: string | null) => Promise<boolean>;
  stopTranscription: () => Promise<VoiceTranscriptionResult>;
};

const nativeVoiceNoteModule = NativeModules.VoiceNoteModule as
  | NativeVoiceNoteModule
  | undefined;

const getVoiceNoteModule = () => {
  if (Platform.OS !== "android" || !nativeVoiceNoteModule) {
    throw new Error("Voice notes require the native Android app.");
  }

  return nativeVoiceNoteModule;
};

export const hasVoiceTranscriptionSupport = async () => {
  if (Platform.OS !== "android" || !nativeVoiceNoteModule) {
    return false;
  }

  return nativeVoiceNoteModule.hasRecognitionSupport();
};

export const hasVoicePermission = async () => {
  if (Platform.OS !== "android" || !nativeVoiceNoteModule) {
    return false;
  }

  return nativeVoiceNoteModule.hasAudioPermission();
};

export const requestVoicePermission = async () =>
  getVoiceNoteModule().requestAudioPermission();

export const startVoiceTranscription = async (languageTag?: string | null) =>
  getVoiceNoteModule().startTranscription(languageTag);

export const stopVoiceTranscription = async () =>
  getVoiceNoteModule().stopTranscription();

export const cancelVoiceTranscription = async () => {
  if (Platform.OS !== "android" || !nativeVoiceNoteModule) {
    return false;
  }

  return nativeVoiceNoteModule.cancelTranscription();
};

export const captureVoiceWithSystemPrompt = async (languageTag?: string | null) =>
  getVoiceNoteModule().captureWithSystemPrompt(languageTag);

export const addVoiceTranscriptListener = (
  listener: (transcript: string) => void,
) =>
  DeviceEventEmitter.addListener("MemonestVoiceTranscript", (event) => {
    if (event && typeof event.transcript === "string") {
      listener(event.transcript);
    }
  });
