import { translateSlackEmoji } from "../dist/translator.js";
import { buildDraftModal, buildResultMessage, buildResultModal } from "./modal.js";

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

  const cachedMappings = emojiValues(dependencies.getCachedMappings());
  const initial = translateSlackEmoji(payload.message?.text || "", cachedMappings);
  if (payload.response_url && dependencies.respond) {
    const opened = await dependencies.openView({
      trigger_id: payload.trigger_id,
      view: buildDraftModal({
        text: initial.output,
        responseUrl: payload.response_url,
        pendingNames: initial.unknown,
      }),
    });
    if (initial.unknown.length === 0) return;

    const { resolved, error } = await resolveUnknown(initial.unknown, dependencies);
    const finalResult = translateSlackEmoji(payload.message?.text || "", {
      ...cachedMappings,
      ...resolved,
    });
    await dependencies.updateView({
      view_id: opened.view.id,
      hash: opened.view.hash,
      view: buildDraftModal({
        text: finalResult.output,
        responseUrl: payload.response_url,
        error,
      }),
    });
    return;
  }

  const opened = await dependencies.openView({
    trigger_id: payload.trigger_id,
    view: buildResultModal({
      text: initial.output,
      pendingNames: initial.unknown,
    }),
  });

  if (initial.unknown.length === 0) return;

  const { resolved, error } = await resolveUnknown(initial.unknown, dependencies);
  const finalResult = translateSlackEmoji(payload.message?.text || "", {
    ...cachedMappings,
    ...resolved,
  });
  await dependencies.updateView({
    view_id: opened.view.id,
    hash: opened.view.hash,
    view: buildResultModal({ text: finalResult.output, error }),
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
      return translateSlackEmoji(`:${element.name}:`, mappings).output;
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

  const responseUrl = payload.view.private_metadata;
  if (!responseUrl) throw new Error("Slack draft has no response URL");
  const cachedMappings = emojiValues(dependencies.getCachedMappings());
  const preview = payload.view.blocks?.find(
    (block) => block.block_id === "translated_preview",
  )?.text?.text;
  const values = payload.view.state?.values || {};
  const input = values.draft?.translated_text || values.draft_pending?.translated_text;
  const draft = typeof preview === "string"
    ? translateSlackEmoji(preview, cachedMappings).output
    : richTextToPlain(input?.rich_text_value, cachedMappings);
  if (!draft.trim()) throw new Error("Slack draft input missing");
  await dependencies.respond(responseUrl, buildResultMessage({ text: draft }));
}

async function resolveUnknown(unknown, dependencies) {
  let resolved = {};
  let error = "";
  try {
    const emojiIndex = await dependencies.listEmoji();
    const customNames = unknown.filter((name) =>
      Object.hasOwn(emojiIndex, name),
    );
    if (customNames.length > 0) {
      resolved = await dependencies.resolveCustom(customNames, emojiIndex);
    }
  } catch {
    error = "일부 커스텀 이모지를 분석하지 못해 이름으로 표시했습니다.";
  }
  return { resolved, error };
}
