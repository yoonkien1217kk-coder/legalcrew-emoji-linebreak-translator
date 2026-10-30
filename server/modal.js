const MAX_RESULT_LENGTH = 40_000;

export function exceedsResultLimit(text) {
  return Array.from(String(text)).length > MAX_RESULT_LENGTH;
}

function checkedResultText(text) {
  if (exceedsResultLimit(text)) throw new RangeError("변환 결과가 40,000자를 넘었습니다.");
  return String(text);
}

export function buildResultMessage({ text }) {
  const resultText = checkedResultText(text) || "변환할 텍스트가 없습니다.";
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

export function buildStatusModal(message) {
  return {
    type: "modal",
    callback_id: "emoji_translation_status",
    title: { type: "plain_text", text: "이모지/줄바꿈 변환" },
    close: { type: "plain_text", text: "닫기" },
    blocks: [{
      type: "section",
      text: { type: "plain_text", text: message },
    }],
  };
}

export function buildDraftModal({ text, responseUrl, pendingNames = [], labeledNames = [], error = "" }) {
  const resultText = checkedResultText(text) || " ";
  const metadataWithText = JSON.stringify({ url: responseUrl, text: resultText });
  const contextText = pendingNames.length
    ? `커스텀 이모지 ${pendingNames.length}개를 확인 중입니다. 결과가 곧 갱신됩니다.`
    : `${error || (labeledNames.length ? `커스텀 이모지 ${labeledNames.length}개는 이름으로 표시했습니다. ` : "")}PC는 코드 블록 옆 복사 버튼을 누르세요. 모바일은 ‘복사용 메시지 받기’를 누르면 본인에게만 보이는 메시지에서 복사할 수 있습니다.`;
  return {
    type: "modal",
    callback_id: "emoji_translation_draft",
    private_metadata: metadataWithText.length <= 3_000
      ? metadataWithText
      : responseUrl,
    title: { type: "plain_text", text: "이모지/줄바꿈 변환" },
    submit: { type: "plain_text", text: "복사용 메시지 받기" },
    close: { type: "plain_text", text: "닫기" },
    blocks: [{
      type: "rich_text",
      block_id: "translated_preview",
      elements: [{
        type: "rich_text_preformatted",
        elements: [{ type: "text", text: resultText }],
      }],
    }, {
      type: "context",
      elements: [{ type: "mrkdwn", text: contextText }],
    }],
  };
}

export function buildResultModal({ text, pendingNames = [], labeledNames = [], error = "" }) {
  const resultText = checkedResultText(text) || " ";
  const contextText = pendingNames.length
    ? `커스텀 이모지 ${pendingNames.length}개를 확인 중입니다. 결과가 곧 갱신됩니다.`
    : `${error || (labeledNames.length ? `커스텀 이모지 ${labeledNames.length}개는 이름으로 표시했습니다. ` : "")}코드 블록의 복사 기능을 사용하세요.`;

  return {
    type: "modal",
    callback_id: "emoji_translation_result",
    title: { type: "plain_text", text: "이모지/줄바꿈 변환" },
    close: { type: "plain_text", text: "닫기" },
    blocks: [
      {
        type: "rich_text",
        block_id: pendingNames.length ? "translated_result_pending" : "translated_result",
        elements: [{
          type: "rich_text_preformatted",
          elements: [{ type: "text", text: resultText }],
        }],
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: contextText }],
      },
    ],
  };
}
