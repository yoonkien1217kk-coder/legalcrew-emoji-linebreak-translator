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
    : error || "코드 블록의 복사 기능을 사용해 결과를 그대로 복사하세요.";

  return {
    type: "modal",
    callback_id: "emoji_translation_result",
    title: { type: "plain_text", text: "SNS용 이모지 변환" },
    close: { type: "plain_text", text: "닫기" },
    blocks: [
      {
        type: "rich_text",
        block_id: "translated_text_result",
        elements: [
          {
            type: "rich_text_preformatted",
            elements: [{ type: "text", text: truncateForSlack(text) }],
          },
        ],
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: contextText }],
      },
    ],
  };
}
