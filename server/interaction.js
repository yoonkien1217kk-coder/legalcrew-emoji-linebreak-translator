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

export async function handleShortcut(payload, dependencies) {
  if (
    payload?.type !== "message_action" ||
    payload.callback_id !== "translate_sns_emoji"
  ) {
    return;
  }

  const source = payload.message?.text || "";
  const initial = translateSlackEmoji(source);
  const draft = Boolean(payload.response_url && dependencies.respond);
  const buildView = (options) => draft
    ? buildDraftModal({ ...options, responseUrl: payload.response_url })
    : buildResultModal(options);
  const opened = await dependencies.openView({
    trigger_id: payload.trigger_id,
    view: initial.unknown.length
      ? buildStatusModal("미확인 이모지 단축어를 확인 중입니다. 잠시만 기다려 주세요.")
      : buildView({ text: initial.output }),
  });
  if (initial.unknown.length === 0) return;

  let view;
  try {
    const emojiIndex = await dependencies.listEmoji();
    const labeledNames = initial.unknown.filter((name) => Object.hasOwn(emojiIndex, name));
    const replacements = Object.fromEntries(
      labeledNames.map((name) => [name, safeAliasLabel(name)]),
    );
    const result = translateSlackEmoji(source, replacements, { preserveUnknown: true });
    view = buildView({ text: result.output, labeledNames });
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
