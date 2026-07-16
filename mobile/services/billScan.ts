import * as FileSystem from "expo-file-system/legacy";

import { parseBillImageWithAi, type BillAiExtraction } from "./api";

export type BillScanResult = {
  amount: number;
  category: string;
  confidence?: number;
  merchant: string;
  parser?: "ai";
};

const emptyScan: BillScanResult = {
  amount: 0,
  category: "general",
  merchant: "Bill purchase",
};

const isValidAiAmount = (result: BillAiExtraction) =>
  typeof result.amount === "number" &&
  Number.isFinite(result.amount) &&
  result.amount > 0 &&
  result.amount < 1_000_000 &&
  result.confidence >= 0.45 &&
  result.evidence.trim().length > 0;

const imageToDataUri = async (imageUri: string) => {
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const mimeType = /\.png$/i.test(imageUri) ? "image/png" : "image/jpeg";
  return `data:${mimeType};base64,${base64}`;
};

export const scanBillForTransaction = async (imageUri: string): Promise<BillScanResult> => {
  try {
    const result = await parseBillImageWithAi(await imageToDataUri(imageUri));

    if (!isValidAiAmount(result)) {
      return emptyScan;
    }

    return {
      amount: result.amount as number,
      category: result.category || emptyScan.category,
      confidence: result.confidence,
      merchant: result.merchant || emptyScan.merchant,
      parser: "ai",
    };
  } catch {
    return emptyScan;
  }
};
