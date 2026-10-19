import test from "node:test";
import assert from "node:assert/strict";

import {
  loadCustomMap,
  saveCustomMapping,
} from "../dist/translator.js";

const memoryStorage = (initial = {}) => ({
  value: initial,
  getItem() {
    return JSON.stringify(this.value);
  },
  setItem(_key, value) {
    this.value = JSON.parse(value);
  },
});

test("recovers from invalid stored JSON", () => {
  assert.deepEqual(loadCustomMap({ getItem: () => "{" }), {});
});

test("normalizes and saves a custom mapping", () => {
  const storage = memoryStorage({});
  assert.deepEqual(saveCustomMapping(storage, "Party_Parrot", "🎉"), {
    party_parrot: "🎉",
  });
});
