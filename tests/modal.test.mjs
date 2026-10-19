import test from "node:test";
import assert from "node:assert/strict";

import { buildResultModal } from "../server/modal.js";

test("builds a multiline copy field with the translated result", () => {
  const view = buildResultModal({ text: "안녕하세요 😃\n두 번째 줄" });

  assert.equal(view.type, "modal");
  assert.equal(view.title.text, "SNS용 이모지 변환");
  assert.equal(view.callback_id, "emoji_translation_result");
  assert.deepEqual(view.blocks[0].element, {
    type: "plain_text_input",
    action_id: "translated_text",
    multiline: true,
    initial_value: "안녕하세요 😃\n두 번째 줄",
  });
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
  const value = view.blocks[0].element.initial_value;

  assert.ok(Array.from(value).length <= 3_000);
  assert.match(value, /Slack 표시 한도로 일부 생략\)$/);
});
