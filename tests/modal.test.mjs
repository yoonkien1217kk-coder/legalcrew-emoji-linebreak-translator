import test from "node:test";
import assert from "node:assert/strict";

import { buildResultModal } from "../server/modal.js";

test("builds desktop and mobile copy surfaces with the same result", () => {
  const view = buildResultModal({ text: "안녕하세요 😃\n두 번째 줄" });
  const desktop = view.blocks.find((block) => block.type === "rich_text");
  const mobile = view.blocks.find((block) => block.type === "input");

  assert.equal(view.type, "modal");
  assert.equal(view.title.text, "SNS용 이모지 변환");
  assert.equal(view.callback_id, "emoji_translation_result");
  assert.deepEqual(view.submit, { type: "plain_text", text: "확인" });
  assert.equal(
    desktop.elements[0].elements[0].text,
    "안녕하세요 😃\n두 번째 줄",
  );
  assert.deepEqual(mobile.element, {
    type: "plain_text_input",
    action_id: "translated_text",
    multiline: true,
    initial_value: "안녕하세요 😃\n두 번째 줄",
  });
});

test("shows pending custom emoji names without exposing message metadata", () => {
  const pendingView = buildResultModal({
    text: "[커비춤]",
    pendingNames: ["커비춤", "리자몽_화남"],
  });
  const finalView = buildResultModal({ text: "🕺" });

  const context = pendingView.blocks.find((block) => block.type === "context");
  const pendingInput = pendingView.blocks.find((block) => block.type === "input");
  const finalInput = finalView.blocks.find((block) => block.type === "input");
  assert.match(context.elements[0].text, /커스텀 이모지 2개 분석 중/);
  assert.notEqual(pendingInput.block_id, finalInput.block_id);
});

test("truncates oversized results at the Slack input limit", () => {
  const view = buildResultModal({ text: "가".repeat(3_100) });
  const desktop = view.blocks.find((block) => block.type === "rich_text");
  const mobile = view.blocks.find((block) => block.type === "input");
  const desktopValue = desktop.elements[0].elements[0].text;
  const mobileValue = mobile.element.initial_value;

  assert.equal(desktopValue, mobileValue);
  assert.ok(Array.from(mobileValue).length <= 3_000);
  assert.match(mobileValue, /Slack 표시 한도로 일부 생략\)$/);
});
