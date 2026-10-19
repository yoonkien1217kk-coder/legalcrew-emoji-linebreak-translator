import test from "node:test";
import assert from "node:assert/strict";

import {
  createCustomEmojiResolver,
  createOpenAIAnalyzer,
  resolveEmojiUrl,
  validateEmojiSuggestion,
} from "../server/custom-emoji.js";

function memoryStore(initial = {}) {
  const values = structuredClone(initial);
  return {
    get: (name) => values[name] || null,
    set: (name, value) => {
      values[name] = { emoji: value.emoji, confidence: value.confidence };
    },
    snapshot: () => structuredClone(values),
  };
}

test("resolves direct URLs and custom alias chains but rejects cycles", () => {
  const index = {
    dragon: "https://emoji.slack-edge.com/T/dragon/a.png",
    charizard: "alias:dragon",
    loop_a: "alias:loop_b",
    loop_b: "alias:loop_a",
  };

  assert.equal(resolveEmojiUrl("dragon", index), index.dragon);
  assert.equal(resolveEmojiUrl("charizard", index), index.dragon);
  assert.equal(resolveEmojiUrl("loop_a", index), null);
  assert.equal(resolveEmojiUrl("missing", index), null);
});

test("accepts one to three emoji graphemes and rejects text or four emoji", () => {
  assert.equal(validateEmojiSuggestion("🐉🔥😡"), "🐉🔥😡");
  assert.equal(validateEmojiSuggestion("🇰🇷"), "🇰🇷");
  assert.equal(validateEmojiSuggestion("🐉 🔥 😡"), "🐉🔥😡");
  assert.equal(validateEmojiSuggestion("🐉🔥😡💥"), null);
  assert.equal(validateEmojiSuggestion("리자몽"), null);
  assert.equal(validateEmojiSuggestion("□"), null);
});

test("reuses cached mappings without analyzing again", async () => {
  let analyzeCalls = 0;
  const resolver = createCustomEmojiResolver({
    emojiIndex: { 커비춤: "https://example.com/kirby.png" },
    store: memoryStore({ 커비춤: { emoji: "🩷💃", confidence: 0.9 } }),
    analyze: async () => {
      analyzeCalls += 1;
      return { emoji: "❌", confidence: 1 };
    },
  });

  assert.deepEqual(await resolver.resolve(["커비춤"]), { 커비춤: "🩷💃" });
  assert.equal(analyzeCalls, 0);
});

test("stores valid analysis and falls back safely for invalid or failed analysis", async () => {
  const store = memoryStore();
  const resolver = createCustomEmojiResolver({
    emojiIndex: {
      리자몽_화남: "https://example.com/charizard.png",
      너무많음: "https://example.com/many.png",
      실패: "https://example.com/fail.png",
      이미지없음: "alias:없는이름",
    },
    store,
    analyze: async ({ name }) => {
      if (name === "리자몽_화남") return { emoji: "🐉🔥😡", confidence: 0.91 };
      if (name === "너무많음") return { emoji: "😀😃😄😁", confidence: 0.99 };
      throw new Error("vision failed");
    },
  });

  assert.deepEqual(
    await resolver.resolve(["리자몽_화남", "너무많음", "실패", "이미지없음"]),
    {
      리자몽_화남: "🐉🔥😡",
      너무많음: "[너무많음]",
      실패: "[실패]",
      이미지없음: "[이미지없음]",
    },
  );
  assert.deepEqual(store.get("리자몽_화남"), {
    emoji: "🐉🔥😡",
    confidence: 0.91,
  });
});

test("OpenAI analyzer sends only the alias and image with a strict schema", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "https://example.com/emoji.png") {
      return new Response(Uint8Array.from([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      });
    }
    return new Response(
      JSON.stringify({
        output: [{ content: [{ type: "output_text", text: '{"emoji":"🩷💃","confidence":0.88}' }] }],
      }),
      { headers: { "content-type": "application/json" } },
    );
  };
  const analyze = createOpenAIAnalyzer({
    apiKey: "test-key",
    model: "gpt-test",
    fetchImpl,
  });

  assert.deepEqual(
    await analyze({ name: "커비춤", url: "https://example.com/emoji.png" }),
    { emoji: "🩷💃", confidence: 0.88 },
  );
  const apiCall = calls[1];
  const body = JSON.parse(apiCall.options.body);
  assert.equal(apiCall.url, "https://api.openai.com/v1/responses");
  assert.equal(body.model, "gpt-test");
  assert.equal(body.store, false);
  assert.match(body.input[0].content[0].text, /커비춤/);
  assert.match(body.input[0].content[1].image_url, /^data:image\/png;base64,/);
  assert.equal(body.input[0].content[1].detail, "high");
  assert.equal(body.text.format.strict, true);
});
