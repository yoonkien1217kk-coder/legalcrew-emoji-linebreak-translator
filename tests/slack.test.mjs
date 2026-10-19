import test from "node:test";
import assert from "node:assert/strict";

import { slackApi, verifySlackRequest } from "../server/slack.js";

const fixture = {
  rawBody: "payload=%7B%22type%22%3A%22message_action%22%7D",
  timestamp: "1700000000",
  signature: "v0=3522e8a9c0ffd2e082cc85091c114c1898b7a306f1b49e4b7f6cd2cf43cd1512",
  signingSecret: "test-secret",
  nowSeconds: 1700000100,
};

test("accepts an authentic Slack request", () => {
  assert.equal(verifySlackRequest(fixture), true);
});

test("rejects changed bodies and stale timestamps", () => {
  assert.equal(
    verifySlackRequest({ ...fixture, rawBody: `${fixture.rawBody}x` }),
    false,
  );
  assert.equal(
    verifySlackRequest({ ...fixture, nowSeconds: 1700000401 }),
    false,
  );
});

test("sends JSON to Slack and returns its successful payload", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ ok: true, view: { id: "V1" } }), {
      headers: { "content-type": "application/json" },
    });
  };

  const result = await slackApi(
    "views.open",
    { trigger_id: "trigger-1" },
    { token: "xoxb-test", fetchImpl },
  );

  assert.deepEqual(result, { ok: true, view: { id: "V1" } });
  assert.equal(calls[0].url, "https://slack.com/api/views.open");
  assert.equal(calls[0].options.headers.authorization, "Bearer xoxb-test");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    trigger_id: "trigger-1",
  });
});

test("reports the Slack method and safe validation details", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        ok: false,
        error: "invalid_arguments",
        response_metadata: {
          messages: ["[ERROR] must provide submit when an input block is used"],
        },
      }),
    );

  await assert.rejects(
    slackApi(
      "views.open",
      { trigger_id: "do-not-log-this" },
      { token: "xoxb-do-not-log-this", fetchImpl },
    ),
    (error) => {
      assert.match(error.message, /views\.open/);
      assert.match(error.message, /invalid_arguments/);
      assert.match(error.message, /must provide submit/);
      assert.doesNotMatch(error.message, /xoxb-do-not-log-this/);
      assert.doesNotMatch(error.message, /do-not-log-this/);
      return true;
    },
  );
});

test("requires the bot token only when a Slack API call is attempted", async () => {
  let fetched = false;
  await assert.rejects(
    slackApi(
      "views.open",
      {},
      {
        token: "",
        fetchImpl: async () => {
          fetched = true;
          return new Response("{}");
        },
      },
    ),
    /SLACK_BOT_TOKEN is required/,
  );
  assert.equal(fetched, false);
});
