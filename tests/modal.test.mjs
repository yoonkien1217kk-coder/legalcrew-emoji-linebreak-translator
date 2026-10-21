import test from "node:test";
import assert from "node:assert/strict";

import { buildDraftModal, buildResultMessage, buildResultModal, buildStatusModal } from "../server/modal.js";

test("uses the emoji and line-break feature name in every modal", () => {
  const views = [
    buildStatusModal("처리 중"),
    buildDraftModal({ text: "안녕", responseUrl: "https://hooks.slack.test/private" }),
    buildResultModal({ text: "안녕" }),
  ];
  assert.deepEqual(views.map((view) => view.title.text), [
    "이모지/줄바꿈 변환",
    "이모지/줄바꿈 변환",
    "이모지/줄바꿈 변환",
  ]);
});

test("shows joined Unicode emoji in a fixed code block while keeping private post", () => {
  const text = "안녕 🏃‍♂️ 👨‍👩‍👧‍👦 🇰🇷";
  const view = buildDraftModal({ text, responseUrl: "https://hooks.slack.test/private" });
  const preview = view.blocks.find((block) => block.block_id === "translated_preview");

  assert.equal(view.callback_id, "emoji_translation_draft");
  assert.equal(view.submit.text, "복사용 메시지 받기");
  assert.deepEqual(JSON.parse(view.private_metadata), {
    url: "https://hooks.slack.test/private",
    text,
  });
  assert.deepEqual(preview.elements, [{
    type: "rich_text_preformatted",
    elements: [{ type: "text", text }],
  }]);
  assert.equal(view.blocks.some((block) => block.type === "input"), false);
});

test("explains how mobile users copy their private result", () => {
  const view = buildDraftModal({
    text: "안녕 😃",
    responseUrl: "https://hooks.slack.test/private",
  });
  const context = view.blocks.find((block) => block.type === "context");

  assert.equal(view.submit.text, "복사용 메시지 받기");
  assert.match(context.elements[0].text, /모바일.*복사용 메시지 받기.*본인에게만.*복사/);
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

test("builds a fixed code block for the desktop copy control", () => {
  const view = buildResultModal({ text: "안녕하세요 😃\n두 번째 줄" });
  const result = view.blocks.find((block) => block.type === "rich_text");

  assert.equal(view.type, "modal");
  assert.equal(view.title.text, "이모지/줄바꿈 변환");
  assert.equal(view.callback_id, "emoji_translation_result");
  assert.equal(view.submit, undefined);
  assert.equal(view.blocks.some((block) => block.type === "input"), false);
  assert.deepEqual(result.elements, [{
    type: "rich_text_preformatted",
    elements: [{ type: "text", text: "안녕하세요 😃\n두 번째 줄" }],
  }]);
});

test("shows pending custom emoji names without exposing message metadata", () => {
  const pendingView = buildResultModal({
    text: "[커비춤]",
    pendingNames: ["커비춤", "리자몽_화남"],
  });
  const finalView = buildResultModal({ text: "🕺" });

  const context = pendingView.blocks.find((block) => block.type === "context");
  const pendingResult = pendingView.blocks.find((block) => block.type === "rich_text");
  const finalResult = finalView.blocks.find((block) => block.type === "rich_text");
  assert.match(context.elements[0].text, /커스텀 이모지 2개를 확인 중/);
  assert.notEqual(pendingResult.block_id, finalResult.block_id);
});

test("truncates oversized results at the Slack input limit", () => {
  const view = buildResultModal({ text: "가".repeat(3_100) });
  const result = view.blocks.find((block) => block.type === "rich_text");
  const value = result.elements[0].elements[0].text;

  assert.ok(Array.from(value).length <= 3_000);
  assert.match(value, /Slack 표시 한도로 일부 생략\)$/);
});
