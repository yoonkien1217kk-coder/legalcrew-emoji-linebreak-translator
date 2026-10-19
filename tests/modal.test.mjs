import test from "node:test";
import assert from "node:assert/strict";

import { buildDraftModal, buildResultMessage, buildResultModal } from "../server/modal.js";

test("shows a fixed Unicode preview with a private-post action", () => {
  const view = buildDraftModal({ text: "안녕 😃", responseUrl: "https://hooks.slack.test/private" });
  const preview = view.blocks.find((block) => block.block_id === "translated_preview");

  assert.equal(view.callback_id, "emoji_translation_draft");
  assert.equal(view.submit.text, "나에게만 올리기");
  assert.deepEqual(JSON.parse(view.private_metadata), {
    url: "https://hooks.slack.test/private",
    text: "안녕 😃",
  });
  assert.deepEqual(preview.elements, [{
    type: "rich_text_section",
    elements: [{ type: "text", text: "안녕 😃" }],
  }]);
  assert.equal(view.blocks.some((block) => block.type === "input"), false);
});

test("keeps modal metadata within Slack's limit for long results", () => {
  const view = buildDraftModal({
    text: "가".repeat(3_100),
    responseUrl: "https://hooks.slack.test/private",
  });
  assert.ok(view.private_metadata.length <= 3_000);
  assert.ok(view.blocks[0].elements[0].elements[0].text.length <= 3_000);
});

test("builds a private, copyable message containing only the translated result", () => {
  const result = "안녕하세요 😃\n두 번째 줄 🇰🇷";
  const message = buildResultMessage({ text: result });

  assert.equal(message.response_type, "ephemeral");
  assert.equal(message.replace_original, false);
  assert.equal(message.text, result);
  assert.deepEqual(message.blocks, [{
    type: "rich_text",
    elements: [{
      type: "rich_text_section",
      elements: [{ type: "text", text: result }],
    }],
  }]);
});

test("builds one plain result that desktop and mobile users can copy", () => {
  const view = buildResultModal({ text: "안녕하세요 😃\n두 번째 줄" });
  const result = view.blocks.find((block) => block.type === "input");

  assert.equal(view.type, "modal");
  assert.equal(view.title.text, "SNS용 이모지 변환");
  assert.equal(view.callback_id, "emoji_translation_result");
  assert.deepEqual(view.submit, { type: "plain_text", text: "확인" });
  assert.equal(view.blocks.some((block) => block.type === "rich_text"), false);
  assert.deepEqual(result.element, {
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
  const result = view.blocks.find((block) => block.type === "input");
  const value = result.element.initial_value;

  assert.ok(Array.from(value).length <= 3_000);
  assert.match(value, /Slack 표시 한도로 일부 생략\)$/);
});
