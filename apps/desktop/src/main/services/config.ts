import fs from "node:fs";
import path from "node:path";

import type { CompanionConfig } from "../../shared/types.js";
import { electron } from "../../shared/electron.js";

const { app } = electron;

const CONFIG_FILE = "memoryos-companion.config.json";

const getConfigPath = () => path.join(app.getPath("userData"), CONFIG_FILE);

const resolveEnvFile = () => {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
    path.resolve(process.cwd(), "..", "..", ".env")
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
};

const readDotEnv = () => {
  const envFile = resolveEnvFile();

  if (!envFile) {
    return {};
  }

  const values: Record<string, string> = {};

  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    values[key] = value;
  }

  return values;
};

const envFileValues = readDotEnv();

const defaultConfig = (): CompanionConfig => ({
  apiUrl:
    process.env.MEMORYOS_API_URL ||
    envFileValues.MEMORYOS_API_URL ||
    "https://memory-green-kappa.vercel.app",
  apiKey:
    process.env.MEMORYOS_API_KEY ||
    process.env.MEMORY_API_KEY ||
    envFileValues.MEMORYOS_API_KEY ||
    envFileValues.MEMORY_API_KEY ||
    "jksnjknd_dhcjdiksa",
  dashboardUrl:
    process.env.MEMORYOS_DASHBOARD_URL ||
    envFileValues.MEMORYOS_DASHBOARD_URL ||
    "https://memory-green-kappa.vercel.app",
  launchAtLogin: true,
});

export class ConfigService {
  getConfig(): CompanionConfig {
    const filePath = getConfigPath();

    if (!fs.existsSync(filePath)) {
      return defaultConfig();
    }

    try {
      return {
        ...defaultConfig(),
        ...JSON.parse(fs.readFileSync(filePath, "utf8")),
      };
    } catch {
      return defaultConfig();
    }
  }

  saveConfig(config: CompanionConfig) {
    fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
  }
}
