import { safeAliasLabel } from "../dist/translator.js";

const EMOJI_GRAPHEME = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)/u;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function resolveEmojiUrl(name, emojiIndex) {
  const visited = new Set();
  let current = name;
  for (let depth = 0; depth < 20; depth += 1) {
    if (visited.has(current)) return null;
    visited.add(current);
    const value = emojiIndex[current];
    if (typeof value !== "string") return null;
    if (!value.startsWith("alias:")) return value;
    current = value.slice("alias:".length);
  }
  return null;
}

export function validateEmojiSuggestion(value) {
  if (typeof value !== "string" || /[:□�]/u.test(value)) return null;
  const compact = value.replace(/\s+/gu, "");
  const segments = [
    ...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(compact),
  ].map(({ segment }) => segment);
  if (segments.length < 1 || segments.length > 3) return null;
  if (!segments.every((segment) => EMOJI_GRAPHEME.test(segment))) return null;
  return segments.join("");
}

export function createCustomEmojiResolver({ emojiIndex, store, analyze }) {
  return {
    async resolve(names) {
      const entries = await Promise.all(
        names.map(async (name) => {
          const cached = store.get(name);
          if (cached) return [name, cached.emoji];

          const url = resolveEmojiUrl(name, emojiIndex);
          if (!url) return [name, safeAliasLabel(name)];

          try {
            const suggestion = await analyze({ name, url });
            const emoji = validateEmojiSuggestion(suggestion?.emoji);
            const confidence = Number(suggestion?.confidence);
            if (emoji && Number.isFinite(confidence) && confidence >= 0.55) {
              store.set(name, { emoji, confidence });
              return [name, emoji];
            }
          } catch {
            // A readable alias label is the safe product behavior on analysis failure.
          }
          return [name, safeAliasLabel(name)];
        }),
      );
      return Object.fromEntries(entries);
    },
  };
}

async function defaultGifConverter(buffer) {
  const { default: sharp } = await import("sharp");
  return sharp(buffer, { animated: false }).png().toBuffer();
}

function responseText(result) {
  if (typeof result.output_text === "string") return result.output_text;
  for (const item of result.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  throw new Error("OpenAI response did not contain output text");
}

async function loadImage(url, fetchImpl, convertGif) {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_IMAGE_BYTES) return null;
    let buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) return null;
    let mediaType = (response.headers.get("content-type") || "image/png")
      .split(";", 1)[0]
      .toLowerCase();
    if (mediaType === "image/gif") {
      buffer = await convertGif(buffer);
      mediaType = "image/png";
    }
    if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(mediaType)) {
      return null;
    }
    return `data:${mediaType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export function createOpenAIAnalyzer({
  apiKey,
  model = "gpt-6-luna",
  fetchImpl = globalThis.fetch,
  convertGif = defaultGifConverter,
}) {
  return async function analyze({ name, url }) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required");
    const imageUrl = await loadImage(url, fetchImpl, convertGif);
    const content = [
      {
        type: "input_text",
        text: [
          `Slack 커스텀 이모지 이름: ${name}`,
          "이 이미지나 이름의 의미와 감정을 브라우저 표준 유니코드 이모지 1~3개로 표현하세요.",
          "캐릭터·밈·텍스트 이미지도 의미를 우선해 가장 가까운 조합을 선택하세요.",
        ].join("\n"),
      },
    ];
    if (imageUrl) {
      content.push({ type: "input_image", image_url: imageUrl, detail: "high" });
    }

    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "emoji_match",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                emoji: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["emoji", "confidence"],
            },
          },
        },
      }),
    });
    const result = await response.json();
    if (!response.ok || result.error) {
      throw new Error(`OpenAI API error: ${result.error?.code || response.status}`);
    }
    return JSON.parse(responseText(result));
  };
}
