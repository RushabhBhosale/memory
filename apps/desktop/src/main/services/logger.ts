import fs from "node:fs";
import path from "node:path";

import { electron } from "../../shared/electron.js";

const { app } = electron;

const LOG_FILE = "memoryos-companion.log";

const toLine = (level: string, scope: string, message: string, details?: Record<string, unknown>) => {
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  return `[${new Date().toISOString()}] [${level}] [${scope}] ${message}${suffix}`;
};

const getLogPath = () => path.join(app.getPath("userData"), LOG_FILE);

const writeLine = (line: string) => {
  console.log(line);

  try {
    fs.mkdirSync(path.dirname(getLogPath()), { recursive: true });
    fs.appendFileSync(getLogPath(), `${line}\n`);
  } catch (error) {
    console.error("[memoryos-desktop] failed to write log file", error);
  }
};

export const desktopLogger = {
  path: getLogPath,
  info(scope: string, message: string, details?: Record<string, unknown>) {
    writeLine(toLine("INFO", scope, message, details));
  },
  warn(scope: string, message: string, details?: Record<string, unknown>) {
    writeLine(toLine("WARN", scope, message, details));
  },
  error(scope: string, message: string, details?: Record<string, unknown>) {
    writeLine(toLine("ERROR", scope, message, details));
  }
};
