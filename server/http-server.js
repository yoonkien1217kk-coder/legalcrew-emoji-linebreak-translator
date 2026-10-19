import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { createCustomEmojiResolver, createOpenAIAnalyzer } from "./custom-emoji.js";
import { handleShortcut } from "./interaction.js";
import { createMappingStore } from "./mapping-store.js";
import { slackApi, verifySlackRequest } from "./slack.js";

const MAX_BODY_BYTES = 1024 * 1024;

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createApp({
  signingSecret,
  teamId = "",
  handleInteraction = async () => {},
  nowSeconds = () => Math.floor(Date.now() / 1000),
  logger = console,
}) {
  return async function app(request, response) {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }
    if (request.method !== "POST" || request.url !== "/slack/interactions") {
      sendJson(response, 404, { ok: false });
      return;
    }

    try {
      const rawBody = await readBody(request);
      const timestamp = request.headers["x-slack-request-timestamp"];
      const signature = request.headers["x-slack-signature"];
      if (
        !verifySlackRequest({
          rawBody,
          timestamp,
          signature,
          signingSecret,
          nowSeconds: nowSeconds(),
        })
      ) {
        sendJson(response, 401, { ok: false });
        return;
      }

      const encodedPayload = new URLSearchParams(rawBody).get("payload");
      const payload = JSON.parse(encodedPayload || "null");
      const payloadTeamId = payload?.team?.id || payload?.team_id || "";
      if (teamId && payloadTeamId !== teamId) {
        sendJson(response, 403, { ok: false });
        return;
      }

      response.writeHead(200);
      response.end();
      queueMicrotask(() => {
        Promise.resolve(handleInteraction(payload)).catch((error) => {
          logger.error(`Slack interaction failed: ${error?.message || "unknown"}`);
        });
      });
    } catch (error) {
      sendJson(response, error.statusCode || 400, { ok: false });
    }
  };
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function createProductionApp({ fetchImpl = globalThis.fetch } = {}) {
  const signingSecret = requiredEnvironment("SLACK_SIGNING_SECRET");
  const token = process.env.SLACK_BOT_TOKEN || "";
  const store = createMappingStore(
    process.env.DATA_FILE || "./data/custom-emoji-map.json",
  );
  const analyze = createOpenAIAnalyzer({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-6-luna",
    fetchImpl,
  });

  const callSlack = (method, body) =>
    slackApi(method, body, { token, fetchImpl });

  return createApp({
    signingSecret,
    teamId: process.env.SLACK_TEAM_ID || "",
    handleInteraction: (payload) =>
      handleShortcut(payload, {
        getCachedMappings: () => store.snapshot(),
        openView: (body) => callSlack("views.open", body),
        updateView: (body) => callSlack("views.update", body),
        listEmoji: async () => (await callSlack("emoji.list", {})).emoji || {},
        resolveCustom: (names, emojiIndex) =>
          createCustomEmojiResolver({ emojiIndex, store, analyze }).resolve(names),
      }),
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.PORT || 3000);
  createServer(createProductionApp()).listen(port, "0.0.0.0", () => {
    console.log(`Slack emoji translator listening on port ${port}`);
  });
}
