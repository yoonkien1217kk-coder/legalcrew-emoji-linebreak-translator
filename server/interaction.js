import { safeAliasLabel, translateSlackEmoji } from "../dist/translator.js";
import { buildDraftModal, buildResultMessage, buildResultModal, buildStatusModal } from "./modal.js";

function emojiValues(snapshot) {
  return Object.fromEntries(
    Object.entries(snapshot || {}).flatMap(([name, value]) => {
      const emoji = typeof value === "string" ? value : value?.emoji;
      return typeof emoji === "string" ? [[name, emoji]] : [];
    }),
  );
}

const USER_MENTION = /<@([UW][A-Z0-9]+)>/g;
const CHANNEL_MENTION = /<#([CG][A-Z0-9]+)>/g;

function plainSlackText(text) {
  return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, index) => {
    if (index % 2) return part.startsWith("```") ? part.slice(3, -3) : part.slice(1, -1);
    let plain = part
      .replace(/(^|\n)(?:>|&gt;) ?/g, "$1")
      .replace(/<(https?:\/\/[^|>]+|mailto:[^|>]+)\|([^>]+)>/g, "$2")
      .replace(/<(https?:\/\/[^>]+|mailto:[^>]+)>/g, "$1");
    for (let i = 0; i < 3; i += 1) {
      plain = plain.replace(/(^|[^\p{L}\p{N}_])(\*{1,2}|_{1,2}|~{1,2})(?=\S)([^\n]*?\S)\2(?=$|[^\p{L}\p{N}_])/gu, "$1$3");
    }
    return plain;
  }).join("");
}

function decodeSlackEscapes(text) {
  return text.replace(/&amp;|&lt;|&gt;/g, (value) => ({
    "&amp;": "&", "&lt;": "<", "&gt;": ">",
  })[value]);
}

async function replaceUserMentions(text, resolveUser) {
  const ids = [...new Set([...text.matchAll(USER_MENTION)].map((match) => match[1]))];
  if (!ids.length) return text;
  const names = new Map(await Promise.all(ids.map(async (id) => {
    try {
      const user = await resolveUser(id);
      return [id, user?.profile?.display_name || user?.profile?.real_name || user?.real_name || user?.name || "알 수 없는 사용자"];
    } catch {
      return [id, "알 수 없는 사용자"];
    }
  })));
  return text.replace(USER_MENTION, (_mention, id) => `@${names.get(id)}`);
}

async function replaceChannelMentions(text, resolveChannel) {
  const ids = [...new Set([...text.matchAll(CHANNEL_MENTION)].map((match) => match[1]))];
  if (!ids.length) return text;
  const names = new Map(await Promise.all(ids.map(async (id) => {
    try {
      const channel = await resolveChannel(id);
      return [id, channel?.name || "알 수 없는 채널"];
    } catch {
      return [id, "알 수 없는 채널"];
    }
  })));
  return text.replace(CHANNEL_MENTION, (_mention, id) => `#${names.get(id)}`);
}

export async function handleShortcut(payload, dependencies) {
  if (
    payload?.type !== "message_action" ||
    payload.callback_id !== "translate_sns_emoji"
  ) {
    return;
  }

  const richTextBlocks = payload.message?.blocks?.filter((block) => block.type === "rich_text") || [];
  const source = decodeSlackEscapes(richTextBlocks.length
    ? richTextBlocks.map((block) => richTextToPlain(block, {})).join("\n")
    : plainSlackText(payload.message?.text || ""));
  const initial = translateSlackEmoji(source);
  const hasMentions = /<@[UW][A-Z0-9]+>/.test(source);
  const hasChannels = /<#[CG][A-Z0-9]+>/.test(source);
  const draft = Boolean(payload.response_url && dependencies.respond);
  const buildView = (options) => draft
    ? buildDraftModal({ ...options, responseUrl: payload.response_url })
    : buildResultModal(options);
  const opened = await dependencies.openView({
    trigger_id: payload.trigger_id,
    view: initial.unknown.length || hasMentions || hasChannels
      ? buildStatusModal("변환 결과를 확인 중입니다. 잠시만 기다려 주세요.")
      : buildView({ text: initial.output }),
  });
  if (initial.unknown.length === 0 && !hasMentions && !hasChannels) return;

  let view;
  try {
    const emojiIndex = initial.unknown.length ? await dependencies.listEmoji() : {};
    const labeledNames = initial.unknown.filter((name) => Object.hasOwn(emojiIndex, name));
    const replacements = Object.fromEntries(
      labeledNames.map((name) => [name, safeAliasLabel(name)]),
    );
    const result = translateSlackEmoji(source, replacements, { preserveUnknown: true });
    let text = hasMentions
      ? await replaceUserMentions(result.output, dependencies.resolveUser)
      : result.output;
    if (hasChannels) text = await replaceChannelMentions(text, dependencies.resolveChannel);
    view = buildView({ text, labeledNames });
  } catch {
    view = buildStatusModal("커스텀 이모지 목록을 확인하지 못해 변환 결과를 만들지 않았습니다. 잠시 후 다시 실행해 주세요.");
  }
  await dependencies.updateView({
    view_id: opened.view.id,
    hash: opened.view.hash,
    view,
  });
}

function richTextToPlain(value, mappings) {
  if (!value || !Array.isArray(value.elements)) {
    throw new Error("Slack draft input missing");
  }
  const elementText = (element) => {
    if (element.type === "text") return element.text || "";
    if (element.type === "emoji") {
      if (/^[0-9a-f]{2,6}(?:-[0-9a-f]{2,6})*$/i.test(element.unicode || "")) {
        try {
          return String.fromCodePoint(...element.unicode.split("-").map((part) => parseInt(part, 16)));
        } catch { /* Fall back to the emoji name. */ }
      }
      return translateSlackEmoji(`:${element.name}:`, mappings, { preserveUnknown: true }).output;
    }
    if (element.type === "link") return element.text || element.url || "";
    if (element.type === "user") return `<@${element.user_id}>`;
    if (element.type === "channel") return `<#${element.channel_id}>`;
    if (element.type === "rich_text_list") {
      const indent = "  ".repeat(Math.min(Math.max(element.indent || 0, 0), 8));
      const offset = element.offset || 0;
      return element.elements.map((item, index) =>
        `${indent}${element.style === "ordered" ? `${offset + index + 1}.` : "-"} ${elementText(item)}`,
      ).join("\n");
    }
    if (Array.isArray(element.elements)) {
      return element.elements.map(elementText).join(
        element.type === "rich_text_list" ? "\n" : "",
      );
    }
    return "";
  };
  return value.elements.map(elementText).join("\n");
}

export async function handleDraftSubmission(payload, dependencies) {
  if (payload?.type !== "view_submission" ||
      payload.view?.callback_id !== "emoji_translation_draft") return;

  let responseUrl = payload.view.private_metadata;
  let preservedText;
  if (responseUrl?.startsWith("{")) {
    const metadata = JSON.parse(responseUrl);
    responseUrl = metadata.url;
    preservedText = metadata.text;
  }
  if (!responseUrl) throw new Error("Slack draft has no response URL");
  const cachedMappings = emojiValues(dependencies.getCachedMappings());
  const previewBlock = payload.view.blocks?.find(
    (block) => block.block_id === "translated_preview",
  );
  const preview = previewBlock?.text?.text ||
    (previewBlock?.type === "rich_text"
      ? richTextToPlain(previewBlock, cachedMappings)
      : undefined);
  const values = payload.view.state?.values || {};
  const input = values.draft?.translated_text || values.draft_pending?.translated_text;
  const draft = typeof preservedText === "string"
    ? preservedText
    : typeof preview === "string"
      ? translateSlackEmoji(preview, cachedMappings, { preserveUnknown: true }).output
    : typeof input?.value === "string"
      ? translateSlackEmoji(input.value, cachedMappings, { preserveUnknown: true }).output
      : richTextToPlain(input?.rich_text_value, cachedMappings);
  if (!draft.trim()) throw new Error("Slack draft input missing");
  await dependencies.respond(responseUrl, buildResultMessage({ text: draft }));
}
