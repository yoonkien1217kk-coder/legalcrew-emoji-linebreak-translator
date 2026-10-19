import { translateSlackEmoji } from "../dist/translator.js";
import { buildResultModal } from "./modal.js";

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
  const opened = await dependencies.openView({
    trigger_id: payload.trigger_id,
    view: buildResultModal({
      text: initial.output,
      pendingNames: initial.unknown,
    }),
  });

  if (initial.unknown.length === 0) return;

  let resolved = {};
  let error = "";
  try {
    const emojiIndex = await dependencies.listEmoji();
    const customNames = initial.unknown.filter((name) =>
      Object.hasOwn(emojiIndex, name),
    );
    if (customNames.length > 0) {
      resolved = await dependencies.resolveCustom(customNames, emojiIndex);
    }
  } catch {
    error = "일부 커스텀 이모지를 분석하지 못해 이름으로 표시했습니다.";
  }

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
