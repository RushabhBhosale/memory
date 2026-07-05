type NativeIntentInput = {
  initial: boolean;
  path: string;
};

const ASSISTANT_DEEP_LINK_PREFIXES = [
  "memonest://assistant",
  "//assistant",
  "assistant?",
];

export function redirectSystemPath({ path }: NativeIntentInput) {
  const matchedPrefix = ASSISTANT_DEEP_LINK_PREFIXES.find((prefix) => path.startsWith(prefix));

  if (!matchedPrefix) {
    return path;
  }

  const queryIndex = path.indexOf("?");
  const query = queryIndex >= 0 ? path.slice(queryIndex) : "";
  const nextPath = `/assistant${query}`;

  console.log("[AppActions] Rewrote native Assistant deep link", { nextPath, path });
  return nextPath;
}
