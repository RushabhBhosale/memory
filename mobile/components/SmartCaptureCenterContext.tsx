import { createContext, useContext } from "react";

export type SmartCaptureCenterActions = {
  openMenu: () => void;
  openQuickCapture: () => void;
  openVoiceCapture: () => void;
};

const noopActions: SmartCaptureCenterActions = {
  openMenu: () => undefined,
  openQuickCapture: () => undefined,
  openVoiceCapture: () => undefined,
};

export const SmartCaptureCenterContext =
  createContext<SmartCaptureCenterActions>(noopActions);

export const useSmartCaptureCenter = () =>
  useContext(SmartCaptureCenterContext);
