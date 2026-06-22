const CODING_APPS = new Set([
  "Visual Studio Code",
  "Code",
  "Cursor",
  "Windsurf",
  "Android Studio",
  "Xcode",
  "IntelliJ IDEA",
  "IntelliJ",
  "WebStorm",
  "Terminal",
  "iTerm2"
]);

const PRODUCTIVE_APPS = new Set([
  ...CODING_APPS,
  "GitHub Desktop",
  "Postman",
  "Chrome",
  "Google Chrome",
  "Arc",
  "ChatGPT",
  "MemoryOS"
]);

const DISTRACTING_APPS = new Set([
  "Instagram",
  "TikTok",
  "Netflix",
  "Prime Video",
  "YouTube"
]);

const FILE_NAME_PATTERN =
  /^(?:\.?[\w-]+(?:\.[\w-]+)+|(?:readme|license|dockerfile|makefile|gemfile|podfile|brewfile))$/i;

const EDITOR_APPS = new Set([
  "Visual Studio Code",
  "Code",
  "Cursor",
  "Windsurf",
  "IntelliJ IDEA",
  "IntelliJ",
  "WebStorm",
  "Android Studio",
  "Xcode"
]);

const SYSTEM_APP_NAME_MAP: Record<string, string> = {
  loginwindow: "Locked Screen",
  electron: "MemoryOS Companion"
};

const splitTitle = (title: string) => title.split(/\s(?:-|—|\|)\s/g).map((part) => part.trim()).filter(Boolean);

const isLikelyFileName = (value: string) => {
  const candidate = value.trim().split("/").pop()?.split("\\").pop() ?? value.trim();
  return FILE_NAME_PATTERN.test(candidate);
};

const isCredibleProjectName = (value: string, appName: string) => {
  if (!value) {
    return false;
  }

  if (value.toLowerCase() === appName.toLowerCase()) {
    return false;
  }

  if (isLikelyFileName(value)) {
    return false;
  }

  return true;
};

export const isCodingApp = (appName: string) => CODING_APPS.has(appName);

export const classifyProductivity = (appName: string, windowTitle: string) => {
  if (DISTRACTING_APPS.has(appName) || /\b(instagram|tiktok|netflix|prime video|youtube)\b/i.test(windowTitle)) {
    return {
      productivity: "distracting" as const,
      productivityScore: -1
    };
  }

  if (PRODUCTIVE_APPS.has(appName)) {
    return {
      productivity: "productive" as const,
      productivityScore: 1
    };
  }

  return {
    productivity: "neutral" as const,
    productivityScore: 0
  };
};

export const normalizeTrackedAppName = (appName: string) =>
  SYSTEM_APP_NAME_MAP[appName.toLowerCase()] || appName;

export const detectProjectName = (appName: string, windowTitle: string) => {
  const title = windowTitle.trim();

  if (!title) {
    return null;
  }

  const parts = splitTitle(title);

  if (parts.length > 1 && EDITOR_APPS.has(appName)) {
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const candidate = parts[index];
      if (isCredibleProjectName(candidate, appName)) {
        return candidate;
      }
    }
  }

  const bracketMatch = title.match(/^\[(.+?)\]/);

  if (bracketMatch?.[1] && isCredibleProjectName(bracketMatch[1].trim(), appName)) {
    return bracketMatch[1].trim();
  }

  return null;
};
