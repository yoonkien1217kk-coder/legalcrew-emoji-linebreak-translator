import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_REQUEST_AGE_SECONDS = 300;

export function verifySlackRequest({
  rawBody,
  timestamp,
  signature,
  signingSecret,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  const requestTime = Number(timestamp);
  if (
    !rawBody ||
    !Number.isFinite(requestTime) ||
    Math.abs(nowSeconds - requestTime) > MAX_REQUEST_AGE_SECONDS ||
    !signature?.startsWith("v0=") ||
    !signingSecret
  ) {
    return false;
  }

  const expected = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export async function slackApi(
  method,
  body,
  { token, fetchImpl = globalThis.fetch },
) {
  if (!token) throw new Error("SLACK_BOT_TOKEN is required");
  const readOnly = method === "users.info" || method === "conversations.info";
  const url = `https://slack.com/api/${method}${readOnly ? `?${new URLSearchParams(body)}` : ""}`;
  const response = await fetchImpl(url, readOnly
    ? { method: "GET", headers: { authorization: `Bearer ${token}` } }
    : {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(body),
      });
  const result = await response.json();
  if (!response.ok || result.ok !== true) {
    const details = Array.isArray(result.response_metadata?.messages)
      ? ` (${result.response_metadata.messages.join("; ")})`
      : "";
    throw new Error(
      `Slack API ${method} error: ${result.error || response.status}${details}`,
    );
  }
  return result;
}

export async function slackResponse(
  responseUrl,
  body,
  { fetchImpl = globalThis.fetch } = {},
) {
  const response = await fetchImpl(responseUrl, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Slack shortcut response error: ${response.status}`);
  }
}
