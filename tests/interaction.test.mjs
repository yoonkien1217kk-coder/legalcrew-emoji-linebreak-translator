import test from "node:test";
import assert from "node:assert/strict";

import { handleShortcut, handleDraftSubmission } from "../server/interaction.js";
import { buildDraftModal } from "../server/modal.js";

const shortcut = {
  type: "message_action",
  callback_id: "translate_sns_emoji",
  trigger_id: "trigger-1",
  message: { text: "기분 :smiley: :커비춤:" },
};

function copyResult(view) {
  return view.blocks.find((block) => block.type === "input").element.initial_value;
}

test("keeps standard emoji while labeling custom aliases without analysis", async () => {
  const events = [];
  let view;
  let updatedView;
  await handleShortcut({
    ...shortcut,
    message: { text: ":smiley: :woman-facepalming: :커비춤: :future_standard_alias:" },
    response_url: "https://hooks.slack.test/private",
  }, {
    getCachedMappings: () => ({}),
    openView: async ({ view: opened }) => {
      events.push("open");
      view = opened;
      return { view: { id: "V1", hash: "h1" } };
    },
    listEmoji: async () => { events.push("list"); return { 커비춤: "https://example.com/kirby.png" }; },
    resolveCustom: async () => { events.push("analyze"); return { 커비춤: "🩷💃" }; },
    updateView: async ({ view: updated }) => { events.push("update"); updatedView = updated; },
  });

  assert.equal(view.blocks.some((block) => block.type === "input"), false);
  assert.equal(copyResult(updatedView), "😃 🤦‍♀️ [커비춤] :future_standard_alias:");
  assert.deepEqual(events, ["open", "list", "update"]);
  assert.match(updatedView.blocks[1].elements[0].text, /1개.*이름으로 표시/);
});

test("opens a safe modal before checking listed custom aliases", async () => {
  const events = [];
  let initialView;
  let updatedView;

  await handleShortcut(shortcut, {
    getCachedMappings: () => ({}),
    openView: async ({ view }) => {
      events.push("open");
      initialView = view;
      return { view: { id: "V1", hash: "h1" } };
    },
    listEmoji: async () => {
      events.push("list");
      return { 커비춤: "https://example.com/kirby.png" };
    },
    resolveCustom: async () => { throw new Error("unexpected analysis"); },
    updateView: async ({ view }) => {
      events.push("update");
      updatedView = view;
    },
  });

  assert.deepEqual(events, ["open", "list", "update"]);
  assert.equal(initialView.blocks.some((block) => block.type === "input"), false);
  assert.match(initialView.blocks[0].text.text, /확인 중/);
  assert.equal(copyResult(updatedView), "기분 😃 [커비춤]");
});

test("opens a plain text draft after custom emoji lookup", async () => {
  const events = [];
  let initialView;
  let updatedView;

  await handleShortcut({ ...shortcut, response_url: "https://hooks.slack.test/private" }, {
    getCachedMappings: () => ({}),
    openView: async ({ view }) => {
      events.push("open");
      initialView = view;
      return { view: { id: "V1", hash: "h1" } };
    },
    listEmoji: async () => {
      events.push("list");
      return { 커비춤: "https://example.com/kirby.png" };
    },
    resolveCustom: async () => { throw new Error("unexpected analysis"); },
    updateView: async ({ view }) => {
      events.push("update");
      updatedView = view;
    },
    respond: async () => { throw new Error("unexpected post"); },
  });

  assert.deepEqual(events, ["open", "list", "update"]);
  assert.equal(initialView.callback_id, "emoji_translation_status");
  assert.equal(updatedView.callback_id, "emoji_translation_draft");
  assert.equal(JSON.parse(updatedView.private_metadata).url, "https://hooks.slack.test/private");
  assert.equal(updatedView.blocks[0].element.initial_value, "기분 😃 [커비춤]");
});

test("standard emoji results do not require the custom emoji API", async () => {
  let view;
  await handleShortcut({
    ...shortcut,
    message: { text: ":smiley: :kr:" },
    response_url: "https://hooks.slack.test/private",
  }, {
    getCachedMappings: () => ({}),
    listEmoji: async () => { throw new Error("unexpected emoji lookup"); },
    openView: async ({ view: draft }) => { view = draft; },
    respond: async () => { throw new Error("unexpected post"); },
  });
  assert.equal(view.blocks[0].element.initial_value, "😃 🇰🇷");
});

test("posts original joined emoji even if Slack changes the plain text draft", async () => {
  const original = "테스트를 하는 나 🫡🏃🏃‍♂️🏃‍♀️🎧🍡";
  const modal = buildDraftModal({
    text: original,
    responseUrl: "https://hooks.slack.test/private",
  });
  let posted;
  await handleDraftSubmission({
    type: "view_submission",
    view: {
      ...modal,
      state: { values: { draft: { translated_text: {
        type: "plain_text_input",
        value: "테스트를 하는 나 🫡🏃🏃♂️🏃♀️🎧🍡",
      } } } },
    },
  }, {
    getCachedMappings: () => ({}),
    respond: async (_url, message) => { posted = message.text; },
  });
  assert.equal(posted, original);
});

test("uses a plain text draft when long metadata cannot hold the original", async () => {
  const modal = buildDraftModal({
    text: "가".repeat(3_100),
    responseUrl: "https://hooks.slack.test/private",
  });
  let posted;
  await handleDraftSubmission({
    type: "view_submission",
    view: {
      ...modal,
      state: { values: { draft: { translated_text: {
        type: "plain_text_input",
        value: modal.blocks[0].element.initial_value,
      } } } },
    },
  }, {
    getCachedMappings: () => ({}),
    respond: async (_url, message) => { posted = message.text; },
  });
  assert.equal(posted, modal.blocks[0].element.initial_value);
});

test("keeps non-custom aliases unchanged when a long draft is posted privately", async () => {
  const original = `${"가".repeat(2_950)} :future_standard_alias: [커비춤]`;
  const modal = buildDraftModal({
    text: original,
    responseUrl: "https://hooks.slack.test/private",
  });
  assert.equal(modal.private_metadata, "https://hooks.slack.test/private");
  let posted;
  await handleDraftSubmission({
    type: "view_submission",
    view: {
      ...modal,
      state: { values: { draft: { translated_text: {
        type: "plain_text_input",
        value: modal.blocks[0].element.initial_value,
      } } } },
    },
  }, {
    getCachedMappings: () => ({}),
    respond: async (_url, message) => { posted = message.text; },
  });
  assert.equal(posted, original);
});

test("posts the fixed preview exactly when the modal is submitted", async () => {
  let posted;
  await handleDraftSubmission({
    type: "view_submission",
    view: {
      callback_id: "emoji_translation_draft",
      private_metadata: "https://hooks.slack.test/private",
      blocks: [{
        type: "section",
        block_id: "translated_preview",
        text: { type: "plain_text", text: "공지 😃 🇰🇷", emoji: false },
      }],
      state: { values: {} },
    },
  }, {
    getCachedMappings: () => ({}),
    respond: async (_url, message) => { posted = message.text; },
  });
  assert.equal(posted, "공지 😃 🇰🇷");
});

test("posts the edited draft privately after modal submission", async () => {
  let response;
  await handleDraftSubmission({
    type: "view_submission",
    view: {
      callback_id: "emoji_translation_draft",
      private_metadata: "https://hooks.slack.test/private",
      state: { values: { draft: { translated_text: { rich_text_value: {
        type: "rich_text",
        elements: [{ type: "rich_text_section", elements: [
          { type: "text", text: "수정 😃 :smile: " },
          { type: "emoji", name: "kr" },
        ] }],
      } } } } },
    },
  }, {
    getCachedMappings: () => ({}),
    respond: async (url, message) => { response = { url, message }; },
  });

  assert.equal(response.url, "https://hooks.slack.test/private");
  assert.equal(response.message.response_type, "ephemeral");
  assert.equal(response.message.text, "수정 😃 :smile: 🇰🇷");
});

test("keeps an unlisted emoji alias in a rich text submission", async () => {
  let posted;
  await handleDraftSubmission({
    type: "view_submission",
    view: {
      callback_id: "emoji_translation_draft",
      private_metadata: "https://hooks.slack.test/private",
      state: { values: { draft: { translated_text: { rich_text_value: {
        type: "rich_text",
        elements: [{ type: "rich_text_section", elements: [
          { type: "emoji", name: "future_standard_alias" },
          { type: "emoji", name: "smiley" },
        ] }],
      } } } } },
    },
  }, {
    getCachedMappings: () => ({}),
    respond: async (_url, message) => { posted = message.text; },
  });
  assert.equal(posted, ":future_standard_alias:😃");
});

test("does not post an empty result when Slack omits the edited draft", async () => {
  let posted = false;
  await assert.rejects(handleDraftSubmission({
    type: "view_submission",
    view: {
      callback_id: "emoji_translation_draft",
      private_metadata: "https://hooks.slack.test/private",
      state: { values: { draft: { translated_text: { type: "rich_text_input" } } } },
    },
  }, {
    getCachedMappings: () => ({}),
    respond: async () => { posted = true; },
  }), /draft input missing/);
  assert.equal(posted, false);
});

test("ignores unrelated interactions", async () => {
  let opened = false;
  await handleShortcut(
    { ...shortcut, callback_id: "something_else" },
    {
      getCachedMappings: () => ({}),
      openView: async () => {
        opened = true;
      },
    },
  );
  assert.equal(opened, false);
});

test("does not offer a copy result when custom emoji lookup fails", async () => {
  let updatedView;
  await handleShortcut(shortcut, {
    getCachedMappings: () => ({}),
    openView: async () => ({ view: { id: "V1", hash: "h1" } }),
    listEmoji: async () => { throw new Error("emoji list unavailable"); },
    updateView: async ({ view }) => {
      updatedView = view;
    },
  });

  assert.equal(updatedView.blocks.some((block) => block.type === "input"), false);
  assert.match(
    updatedView.blocks[0].text.text,
    /목록을 확인하지 못해.*다시 실행/,
  );
});
