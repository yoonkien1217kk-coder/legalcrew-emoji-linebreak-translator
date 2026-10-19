import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

function load(filePath) {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export function createMappingStore(filePath) {
  const values = load(filePath);

  function persist() {
    mkdirSync(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(values, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, filePath);
  }

  return {
    get(name) {
      const value = values[name];
      if (!value || typeof value.emoji !== "string") return null;
      return { emoji: value.emoji, confidence: Number(value.confidence) };
    },
    set(name, value) {
      values[name] = {
        emoji: String(value.emoji),
        confidence: Number(value.confidence),
      };
      persist();
    },
    snapshot() {
      return structuredClone(values);
    },
  };
}
