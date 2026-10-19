const MAX_INITIAL_VALUE_LENGTH = 3_000;
const TRUNCATION_SUFFIX = "\n…(Slack 표시 한도로 일부 생략)";

function truncateForSlack(text) {
  const characters = Array.from(String(text));
  if (characters.length <= MAX_INITIAL_VALUE_LENGTH) return characters.join("");
  const suffix = Array.from(TRUNCATION_SUFFIX);
  return characters
    .slice(0, MAX_INITIAL_VALUE_LENGTH - suffix.length)
    .concat(suffix)
    .join("");
}

export function buildResultMessage({ text }) {
  const resultText = truncateForSlack(text) || "변환할 텍스트가 없습니다.";
  return {
    response_type: "ephemeral",
    replace_original: false,
    text: resultText,
    blocks: [{
      type: "rich_text",
      elements: [{
        type: "rich_text_section",
        elements: [{ type: "text", text: resultText }],
      }],
    }],
  };
}

export function buildDraftModal({ text, responseUrl, pendingNames = [], error = "" }) {
  const resultText = truncateForSlack(text) || " ";
  const metadataWithText = JSON.stringify({ url: responseUrl, text: resultText });
  const contextText = pendingNames.length
    ? `⏳ 커스텀 이모지 ${pendingNames.length}개 분석 중입니다. 잠시 후 결과가 갱신됩니다.`
    : error || "PC는 Ctrl/Cmd+A 후 복사, 모바일은 길게 눌러 전체 선택 후 복사하세요.";
  return {
    type: "modal",
    callback_id: "emoji_translation_draft",
    private_metadata: metadataWithText.length <= 3_000
      ? metadataWithText
      : responseUrl,
    title: { type: "plain_text", text: "SNS용 이모지 변환" },
    submit: { type: "plain_text", text: "나에게만 올리기" },
    close: { type: "plain_text", text: "닫기" },
    blocks: [{
      type: "input",
      block_id: pendingNames.length ? "draft_pending" : "draft",
      label: { type: "plain_text", text: "복사할 결과" },
      optional: true,
      element: {
        type: "plain_text_input",
        action_id: "translated_text",
        multiline: true,
        initial_value: resultText,
      },
    }, {
      type: "context",
      elements: [{ type: "mrkdwn", text: contextText }],
    }],
  };
}

export function buildResultModal({ text, pendingNames = [], error = "" }) {
  const resultText = truncateForSlack(text);
  const contextText = pendingNames.length
    ? `⏳ 커스텀 이모지 ${pendingNames.length}개 분석 중입니다. 잠시 후 결과가 갱신됩니다.`
    : error ||
      "PC는 Ctrl/Cmd+A 후 복사, 모바일은 길게 눌러 전체 선택 후 복사하세요.";

  return {
    type: "modal",
    callback_id: "emoji_translation_result",
    title: { type: "plain_text", text: "SNS용 이모지 변환" },
    submit: { type: "plain_text", text: "확인" },
    close: { type: "plain_text", text: "닫기" },
    blocks: [
      {
        type: "input",
        block_id: pendingNames.length
          ? "translated_text_block_pending"
          : "translated_text_block",
        label: { type: "plain_text", text: "복사할 결과" },
        optional: true,
        element: {
          type: "plain_text_input",
          action_id: "translated_text",
          multiline: true,
          initial_value: resultText,
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: contextText }],
      },
    ],
  };
}
