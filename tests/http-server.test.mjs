import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";

import { createApp } from "../server/http-server.js";

const NOW = 1_700_000_100;
const SECRET = "test-secret";

function sign(body, timestamp = "1700000000") {
  return {
    timestamp,
    signature: `v0=${createHmac("sha256", SECRET)
      .update(`v0:${timestamp}:${body}`)
      .digest("hex")}`,
  };
}

async function withServer(options, callback) {
  const server = createServer(createApp(options));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("serves a health response", async () => {
  await withServer(
    { signingSecret: SECRET, nowSeconds: () => NOW },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
    },
  );
});

test("rejects invalid signatures without invoking the interaction", async () => {
  let invoked = false;
  await withServer(
    {
      signingSecret: SECRET,
      nowSeconds: () => NOW,
      handleInteraction: async () => {
        invoked = true;
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/slack/interactions`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-slack-request-timestamp": "1700000000",
          "x-slack-signature": "v0=wrong",
        },
        body: "payload=%7B%7D",
      });
      assert.equal(response.status, 401);
      assert.equal(invoked, false);
    },
  );
});

test("rejects a different Slack workspace", async () => {
  const body = new URLSearchParams({
    payload: JSON.stringify({ team: { id: "T-OTHER" } }),
  }).toString();
  const headers = sign(body);
  await withServer(
    { signingSecret: SECRET, teamId: "T-LEGAL", nowSeconds: () => NOW },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/slack/interactions`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-slack-request-timestamp": headers.timestamp,
          "x-slack-signature": headers.signature,
        },
        body,
      });
      assert.equal(response.status, 403);
    },
  );
});

test("acknowledges a valid shortcut before async processing finishes", async () => {
  let invoked = false;
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const payload = {
    type: "message_action",
    callback_id: "translate_sns_emoji",
    team: { id: "T-LEGAL" },
    message: { text: ":smiley:" },
  };
  const body = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
  const headers = sign(body);

  await withServer(
    {
      signingSecret: SECRET,
      teamId: "T-LEGAL",
      nowSeconds: () => NOW,
      handleInteraction: async () => {
        invoked = true;
        await pending;
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/slack/interactions`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-slack-request-timestamp": headers.timestamp,
          "x-slack-signature": headers.signature,
        },
        body,
      });
      assert.equal(response.status, 200);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(invoked, true);
      release();
    },
  );
});

test("acknowledges a result modal submission so Slack closes it", async () => {
  const payload = {
    type: "view_submission",
    team: { id: "T-LEGAL" },
    view: { callback_id: "emoji_translation_result" },
  };
  const body = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
  const headers = sign(body);

  await withServer(
    { signingSecret: SECRET, teamId: "T-LEGAL", nowSeconds: () => NOW },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/slack/interactions`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-slack-request-timestamp": headers.timestamp,
          "x-slack-signature": headers.signature,
        },
        body,
      });

      assert.equal(response.status, 200);
      assert.equal(await response.text(), "");
    },
  );
});
