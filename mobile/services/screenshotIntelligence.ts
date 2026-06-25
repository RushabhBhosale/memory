import { analyzeScreenshot as analyzeScreenshotWithAi } from "./ai";

export type ScreenshotAnalysis = {
  title: string;
  category: string;
  tags: string[];
};

export const analyzeScreenshot = async (text: string): Promise<ScreenshotAnalysis> =>
  analyzeScreenshotWithAi(text);
