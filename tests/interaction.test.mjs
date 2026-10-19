import test from "node:test";
import assert from "node:assert/strict";

import { handleShortcut } from "../server/interaction.js";

const shortcut = {
  type: "message_action",
  callback_id: "translate_sns_emoji",
  trigger_id: "trigger-1",
  message: { text: "기분 :smiley: :커비춤:" },
};

function copyResults(view) {
  const desktop = view.blocks.find((block) => block.type === "rich_text");
  const mobile = view.blocks.find((block) => block.type === "input");
  return {
    desktop: desktop.elements[0].elements[0].text,
    mobile: mobile.element.initial_value,
  };
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
  assert.deepEqual(copyResults(initialView), {
    desktop: "기분 😃 [커비춤]",
    mobile: "기분 😃 [커비춤]",
  });
  assert.match(
    initialView.blocks.find((block) => block.type === "context").elements[0].text,
    /분석 중/,
  );
  assert.deepEqual(copyResults(updatedView), {
    desktop: "기분 😃 🩷💃",
    mobile: "기분 😃 🩷💃",
  });
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

  assert.deepEqual(copyResults(updatedView), {
    desktop: "기분 😃 [커비춤]",
    mobile: "기분 😃 [커비춤]",
  });
  assert.match(
    updatedView.blocks.find((block) => block.type === "context").elements[0].text,
    /분석하지 못해 이름으로 표시/,
  );
});
