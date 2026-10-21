import { EMOJI_MAP } from "./emoji-map.js";

const TOKEN = /:([\p{L}\p{N}_+\-]+):/gu;
const STORAGE_KEY = "slack-sns-emoji-map-v1";
const TRAILING_ZWJ_SKIN_TONE =
  /(\p{Emoji_Modifier_Base})(\uFE0F?)((?:\u200D\p{Extended_Pictographic}\uFE0F?)+)([\u{1F3FB}-\u{1F3FF}])/gu;

export function translateSlackEmoji(input, customMap = {}, { preserveUnknown = false } = {}) {
  const unknown = new Set();
  let convertedCount = 0;

  const replaced = input.replace(TOKEN, (token, rawName) => {
    const name = rawName.toLowerCase();
    const emoji = customMap[name] || EMOJI_MAP[name];

    if (!emoji) {
      unknown.add(name);
      return preserveUnknown ? token : safeAliasLabel(name);
    }

    convertedCount += 1;
    return emoji;
  });

  const output = replaced
    .replace(TRAILING_ZWJ_SKIN_TONE, "$1$4$2$3")
    .replace(/[□�]/gu, "[표시할 수 없는 이모지]")
    .replace(/\r\n?/g, "\n")
    .replace(/ (?= )/g, " \u200B")
    .replace(/(^|\n)(?=\n)/g, "$1\u200B");

  return { output, convertedCount, unknown: [...unknown] };
}

export function safeAliasLabel(name) {
  const readable = String(name)
    .replace(/[□�]/gu, "")
    .replace(/_+/gu, " ")
    .trim();
  return `[${readable || "커스텀 이모지"}]`;
}

export function extractSlackEmojiNames(input) {
  const names = new Set();
  for (const match of String(input).matchAll(TOKEN)) {
    names.add(match[1].toLowerCase());
  }
  return [...names];
}

export function loadCustomMap(storage) {
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function saveCustomMapping(storage, name, emoji) {
  const next = {
    ...loadCustomMap(storage),
    [name.toLowerCase()]: emoji,
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
