import test from "node:test";
import assert from "node:assert/strict";

import { handleShortcut, handleDraftSubmission } from "../server/interaction.js";

const shortcut = {
  type: "message_action",
  callback_id: "translate_sns_emoji",
  trigger_id: "trigger-1",
  message: { text: "기분 :smiley: :커비춤:" },
};

function copyResult(view) {
  return view.blocks.find((block) => block.type === "input").element.initial_value;
}

test("opens a safe modal before resolving only unknown aliases", async () => {
  const events = [];
  const resolvedNames = [];
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
    resolveCustom: async (names) => {
      events.push("resolve");
      resolvedNames.push(...names);
      return { 커비춤: "🩷💃" };
    },
    updateView: async ({ view }) => {
      events.push("update");
      updatedView = view;
    },
  });

  assert.deepEqual(events, ["open", "list", "resolve", "update"]);
  assert.deepEqual(resolvedNames, ["커비춤"]);
  assert.equal(copyResult(initialView), "기분 😃 [커비춤]");
  assert.match(
    initialView.blocks.find((block) => block.type === "context").elements[0].text,
    /분석 중/,
  );
  assert.equal(copyResult(updatedView), "기분 😃 🩷💃");
});

test("opens an editable draft before the private result is posted", async () => {
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
    resolveCustom: async () => {
      events.push("resolve");
      return { 커비춤: "🩷💃" };
    },
    updateView: async ({ view }) => {
      events.push("update");
      updatedView = view;
    },
    respond: async () => { throw new Error("unexpected post"); },
  });

  assert.deepEqual(events, ["open", "list", "resolve", "update"]);
  assert.equal(initialView.callback_id, "emoji_translation_draft");
  assert.equal(initialView.private_metadata, "https://hooks.slack.test/private");
  assert.equal(updatedView.blocks[0].element.initial_value.elements[0].elements[0].text, "기분 😃 🩷💃");
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
  assert.equal(view.blocks[0].element.initial_value.elements[0].elements[0].text, "😃 🇰🇷");
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

test("keeps safe labels when custom analysis fails", async () => {
  let updatedView;
  await handleShortcut(shortcut, {
    getCachedMappings: () => ({}),
    openView: async () => ({ view: { id: "V1", hash: "h1" } }),
    listEmoji: async () => ({ 커비춤: "https://example.com/kirby.png" }),
    resolveCustom: async () => {
      throw new Error("vision unavailable");
    },
    updateView: async ({ view }) => {
      updatedView = view;
    },
  });

  assert.equal(copyResult(updatedView), "기분 😃 [커비춤]");
  assert.match(
    updatedView.blocks.find((block) => block.type === "context").elements[0].text,
    /분석하지 못해 이름으로 표시/,
  );
});
