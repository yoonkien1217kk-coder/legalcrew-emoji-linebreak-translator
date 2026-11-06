import { handleDraftSubmission, handleShortcut } from "./interaction.js";
import { slackApi, slackResponse, verifySlackRequest } from "./slack.js";

const MAX_BODY_BYTES = 1024 * 1024;

async function readBody(request) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        const error = new Error("request body too large");
        error.statusCode = 413;
        throw error;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function productionInteraction(payload, env) {
  const callSlack = (method, body) =>
    slackApi(method, body, { token: env.SLACK_BOT_TOKEN });
  const dependencies = {
    getCachedMappings: () => ({}),
    openView: (body) => callSlack("views.open", body),
    updateView: (body) => callSlack("views.update", body),
    respond: (url, body) => slackResponse(url, body),
    listEmoji: async () => (await callSlack("emoji.list", {})).emoji || {},
    resolveUser: async (user) => (await callSlack("users.info", { user })).user,
    resolveChannel: async (channel) => (await callSlack("conversations.info", { channel })).channel,
  };
  return payload?.type === "view_submission"
    ? handleDraftSubmission(payload, dependencies)
    : handleShortcut(payload, dependencies);
}

export function createWorkerApp({
  handleInteraction = productionInteraction,
  nowSeconds = () => Math.floor(Date.now() / 1000),
  logger = console,
} = {}) {
  return {
    async fetch(request, env, ctx) {
      const pathname = new URL(request.url).pathname;
      if (request.method === "GET" && pathname === "/health") {
        return jsonResponse(200, { ok: true });
      }
      if (request.method !== "POST" || pathname !== "/slack/interactions") {
        return jsonResponse(404, { ok: false });
      }

      try {
        const rawBody = await readBody(request);
        if (!verifySlackRequest({
          rawBody,
          timestamp: request.headers.get("x-slack-request-timestamp"),
          signature: request.headers.get("x-slack-signature"),
          signingSecret: env.SLACK_SIGNING_SECRET,
          nowSeconds: nowSeconds(),
        })) {
          return jsonResponse(401, { ok: false });
        }

        const encodedPayload = new URLSearchParams(rawBody).get("payload");
        const payload = JSON.parse(encodedPayload || "null");
        const payloadTeamId = payload?.team?.id || payload?.team_id || "";
        if (env.SLACK_TEAM_ID && payloadTeamId !== env.SLACK_TEAM_ID) {
          return jsonResponse(403, { ok: false });
        }

        ctx.waitUntil(Promise.resolve()
          .then(() => handleInteraction(payload, env))
          .catch((error) => {
            logger.error(`Slack interaction failed: ${error?.message || "unknown"}`);
          }));
        return new Response(null, { status: 200 });
      } catch (error) {
        return jsonResponse(error.statusCode || 400, { ok: false });
      }
    },
  };
}

export default createWorkerApp();
