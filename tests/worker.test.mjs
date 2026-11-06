import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { createWorkerApp } from "../server/worker.js";

const SECRET = "test-secret";
const NOW = 1_700_000_100;
const ENV = {
  SLACK_SIGNING_SECRET: SECRET,
  SLACK_TEAM_ID: "T-LEGAL",
  SLACK_BOT_TOKEN: "test-token",
};

function signedRequest(payload) {
  const body = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
  const timestamp = "1700000000";
  const signature = `v0=${createHmac("sha256", SECRET)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
  return new Request("https://example.workers.dev/slack/interactions", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    },
    body,
  });
}

function executionContext() {
  const pending = [];
  return {
    pending,
    waitUntil(promise) { pending.push(promise); },
  };
}

test("Worker health endpoint responds without Slack secrets", async () => {
  const app = createWorkerApp();
  const response = await app.fetch(new Request("https://example.workers.dev/health"), {}, executionContext());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("Worker rejects unsigned and foreign-workspace interactions", async () => {
  let calls = 0;
  const app = createWorkerApp({ nowSeconds: () => NOW, handleInteraction: () => { calls += 1; } });
  const ctx = executionContext();
  const unsigned = await app.fetch(new Request("https://example.workers.dev/slack/interactions", {
    method: "POST", body: "payload=%7B%7D",
  }), ENV, ctx);
  const foreign = await app.fetch(signedRequest({ team: { id: "T-OTHER" } }), ENV, ctx);
  assert.equal(unsigned.status, 401);
  assert.equal(foreign.status, 403);
  assert.equal(calls, 0);
  assert.equal(ctx.pending.length, 0);
});

test("Worker acknowledges a shortcut and retains processing with waitUntil", async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const seen = [];
  const app = createWorkerApp({
    nowSeconds: () => NOW,
    handleInteraction: async (payload, env) => {
      seen.push([payload.callback_id, env.SLACK_TEAM_ID]);
      await held;
    },
  });
  const ctx = executionContext();
  const response = await app.fetch(signedRequest({
    type: "message_action",
    callback_id: "translate_sns_emoji",
    team: { id: "T-LEGAL" },
  }), ENV, ctx);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
  assert.equal(ctx.pending.length, 1);
  await Promise.resolve();
  assert.deepEqual(seen, [["translate_sns_emoji", "T-LEGAL"]]);
  release();
  await Promise.all(ctx.pending);
});

test("Worker refuses a request body over 1 MB before processing", async () => {
  const app = createWorkerApp({ handleInteraction: () => { throw new Error("should not run"); } });
  const ctx = executionContext();
  const response = await app.fetch(new Request("https://example.workers.dev/slack/interactions", {
    method: "POST", body: "x".repeat(1024 * 1024 + 1),
  }), ENV, ctx);
  assert.equal(response.status, 413);
  assert.equal(ctx.pending.length, 0);
});
