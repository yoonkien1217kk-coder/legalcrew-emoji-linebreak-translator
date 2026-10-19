import test from "node:test";
import assert from "node:assert/strict";

import { buildResultModal } from "../server/modal.js";

test("builds a read-only preformatted result that Slack cannot edit", () => {
  const view = buildResultModal({ text: "안녕하세요 😃\n두 번째 줄" });

  assert.equal(view.type, "modal");
  assert.equal(view.title.text, "SNS용 이모지 변환");
  assert.equal(view.callback_id, "emoji_translation_result");
  assert.equal(view.submit, undefined);
  assert.deepEqual(view.blocks[0], {
    type: "rich_text",
    block_id: "translated_text_result",
    elements: [
      {
        type: "rich_text_preformatted",
        elements: [{ type: "text", text: "안녕하세요 😃\n두 번째 줄" }],
      },
    ],
  });
  assert.equal(view.blocks.some((block) => block.type === "input"), false);
});

test("shows pending custom emoji names without exposing message metadata", () => {
  const view = buildResultModal({
    text: "[커비춤]",
    pendingNames: ["커비춤", "리자몽_화남"],
  });

  const context = view.blocks.find((block) => block.type === "context");
  assert.match(context.elements[0].text, /커스텀 이모지 2개 분석 중/);
});

test("truncates oversized results at the Slack input limit", () => {
  const view = buildResultModal({ text: "가".repeat(3_100) });
  const value = view.blocks[0].elements[0].elements[0].text;

  assert.ok(Array.from(value).length <= 3_000);
  assert.match(value, /Slack 표시 한도로 일부 생략\)$/);
});
