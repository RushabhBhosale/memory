import { createContext, useContext } from "react";

export type SmartCaptureCenterActions = {
  openMenu: () => void;
  openQuickCapture: (initialText?: string) => void;
  openAssistantLogCapture: (draft: { description?: string; name?: string }) => void;
  openVoiceCapture: () => void;
};

const noopActions: SmartCaptureCenterActions = {
  openMenu: () => undefined,
  openQuickCapture: () => undefined,
  openAssistantLogCapture: () => undefined,
  openVoiceCapture: () => undefined,
};

export const SmartCaptureCenterContext =
  createContext<SmartCaptureCenterActions>(noopActions);

export const useSmartCaptureCenter = () =>
  useContext(SmartCaptureCenterContext);
