import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMappingStore } from "../server/mapping-store.js";

test("starts empty when the mapping file is missing or malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "emoji-map-test-"));
  const missing = join(directory, "missing.json");
  assert.deepEqual(createMappingStore(missing).snapshot(), {});

  const malformed = join(directory, "malformed.json");
  writeFileSync(malformed, "{");
  assert.deepEqual(createMappingStore(malformed).snapshot(), {});
});

test("persists only the accepted emoji and confidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "emoji-map-test-"));
  const file = join(directory, "mappings.json");
  const store = createMappingStore(file);

  store.set("리자몽_화남", {
    emoji: "🐉🔥😡",
    confidence: 0.91,
    image: "must-not-be-stored",
    message: "must-not-be-stored",
  });

  assert.deepEqual(createMappingStore(file).get("리자몽_화남"), {
    emoji: "🐉🔥😡",
    confidence: 0.91,
  });
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), {
    리자몽_화남: { emoji: "🐉🔥😡", confidence: 0.91 },
  });
});
