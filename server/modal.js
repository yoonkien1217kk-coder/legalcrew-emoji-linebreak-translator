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

export function buildResultModal({ text, pendingNames = [], error = "" }) {
  const contextText = pendingNames.length
    ? `⏳ 커스텀 이모지 ${pendingNames.length}개 분석 중입니다. 잠시 후 결과가 갱신됩니다.`
    : error || "결과를 선택한 뒤 Ctrl/Cmd+A, Ctrl/Cmd+C로 복사하세요.";

  return {
    type: "modal",
    callback_id: "emoji_translation_result",
    title: { type: "plain_text", text: "SNS용 이모지 변환" },
    submit: { type: "plain_text", text: "확인" },
    close: { type: "plain_text", text: "닫기" },
    blocks: [
      {
        type: "input",
        block_id: "translated_text_block",
        label: { type: "plain_text", text: "복사할 결과" },
        optional: true,
        element: {
          type: "rich_text_input",
          action_id: "translated_text",
          min_lines: 10,
          max_lines: 20,
          initial_value: {
            type: "rich_text",
            elements: [
              {
                type: "rich_text_section",
                elements: [{ type: "text", text: truncateForSlack(text) }],
              },
            ],
          },
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: contextText }],
      },
    ],
  };
}
