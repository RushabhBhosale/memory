type OcrResult = {
  confidence: number;
  text: string;
};

type TextRecognitionModule = {
  recognize: (uri: string) => Promise<unknown>;
};

const normalizeOcrResult = (value: unknown): OcrResult => {
  if (typeof value === "string") {
    return { confidence: value ? 0.7 : 0, text: value };
  }

  if (!value || typeof value !== "object") {
    return { confidence: 0, text: "" };
  }

  const record = value as Record<string, unknown>;
  const text =
    typeof record.text === "string"
      ? record.text
      : Array.isArray(record.blocks)
        ? record.blocks
            .map((block) =>
              block && typeof block === "object" && "text" in block
                ? String((block as { text?: unknown }).text || "")
                : "",
            )
            .filter(Boolean)
            .join("\n")
        : "";

  return {
    confidence: text ? 0.8 : 0,
    text,
  };
};

const loadTextRecognition = (): TextRecognitionModule | null => {
  try {
    const loaded = require("@react-native-ml-kit/text-recognition") as {
      default?: TextRecognitionModule;
      recognize?: TextRecognitionModule["recognize"];
    };

    if (loaded.default?.recognize) {
      return loaded.default;
    }

    if (loaded.recognize) {
      return { recognize: loaded.recognize };
    }
  } catch {
    return null;
  }

  return null;
};

export const extractTextFromScreenshot = async (uri: string): Promise<OcrResult> => {
  const recognizer = loadTextRecognition();

  if (!recognizer) {
    return { confidence: 0, text: "" };
  }

  try {
    return normalizeOcrResult(await recognizer.recognize(uri));
  } catch {
    return { confidence: 0, text: "" };
  }
};
