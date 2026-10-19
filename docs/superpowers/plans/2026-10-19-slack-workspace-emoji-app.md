# LegalCrew Slack 워크스페이스 이모지 앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slack 메시지 단축어로 기본·커스텀 이모지를 브라우저 호환 유니코드로 변환하고 복사용 모달을 여는 LegalCrew 내부 앱을 만든다.

**Architecture:** 기존 순수 변환 모듈을 서버에서도 재사용한다. Node HTTP 서버가 서명된 Slack interaction을 확인하고 즉시 모달을 연 뒤, 해당 메시지에 등장한 미분석 커스텀 이모지만 OpenAI 비전으로 분석해 저장하고 같은 모달을 갱신한다.

**Tech Stack:** Node.js 20+, ES modules, Node built-in test runner, Slack Web API, OpenAI Responses API, `sharp` for animated GIF first-frame conversion

**Spec:** `docs/superpowers/specs/2026-10-19-slack-workspace-emoji-app-design.md`

## Global Constraints

- 단일 LegalCrew 워크스페이스용 내부 앱이며 Marketplace 배포를 하지 않는다.
- Slack bot scope는 `commands`, `emoji:read`만 요청한다.
- 메시지 원문과 사용자 정보는 OpenAI로 보내거나 로그에 남기지 않는다.
- OpenAI에는 실제로 사용된 미분석 커스텀 이모지 이름과 이미지만 보낸다.
- 최종 결과에는 `□`, `�` 또는 해석되지 않은 `:custom_alias:`가 남지 않는다.
- AI가 유효한 유니코드 이모지 1~3개를 주지 못하면 `[이름]`으로 폴백한다.
- Slack 요청은 원본 본문으로 서명을 검증하고 5분 이상 지난 요청을 거부한다.
- 프로덕션 코드는 반드시 실패하는 테스트를 먼저 확인한 후 작성한다.

---

### Task 1: 네모 없는 공용 변환 코어

**Files:**
- Modify: `dist/translator.js`
- Modify: `dist/app.js`
- Modify: `tests/translator.test.mjs`

**Interfaces:**
- Produces: `extractSlackEmojiNames(input) -> string[]`
- Produces: `safeAliasLabel(name) -> string`
- Keeps: `translateSlackEmoji(input, customMap) -> { output, convertedCount, unknown }`

- [ ] **Step 1: Write failing tests for Unicode aliases and safe fallback**

```js
test("uses readable labels for unknown Unicode aliases without broken squares", () => {
  assert.deepEqual(translateSlackEmoji(":리자몽_화남: :smiley:"), {
    output: "[리자몽 화남] 😃",
    convertedCount: 1,
    unknown: ["리자몽_화남"],
  });
});

test("extracts unique standard and custom aliases in source order", () => {
  assert.deepEqual(
    extractSlackEmojiNames(":smiley: :커비춤: :smiley:"),
    ["smiley", "커비춤"],
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/translator.test.mjs`

Expected: FAIL because Korean aliases are not recognized and `extractSlackEmojiNames` is not exported.

- [ ] **Step 3: Implement Unicode tokenization and safe labels**

Use `const TOKEN = /:([\p{L}\p{N}_+\-]+):/gu`. Replace an unknown alias with `safeAliasLabel(name)`, where underscores become single spaces and any literal `□` or `�` is removed. Export `extractSlackEmojiNames` using the same token expression and a `Set` to preserve first-seen order.

- [ ] **Step 4: Keep browser copying available for safe fallbacks**

In `dist/app.js`, change `copyButton.disabled` to depend only on empty source. Keep the unknown mapping inputs so a browser user can optionally replace `[이름]` with a chosen emoji.

- [ ] **Step 5: Run existing and new tests**

Run: `node --test tests/*.test.mjs`

Expected: all tests PASS and the previous standard-emoji regression still produces `😃😑🤦‍♀️😊😏🧑🏻‍🔬😜`.

### Task 2: Slack 서명과 모달 payload

**Files:**
- Create: `server/slack.js`
- Create: `server/modal.js`
- Create: `tests/slack.test.mjs`
- Create: `tests/modal.test.mjs`

**Interfaces:**
- Produces: `verifySlackRequest({ rawBody, timestamp, signature, signingSecret, nowSeconds }) -> boolean`
- Produces: `slackApi(method, body, { token, fetchImpl }) -> Promise<object>`
- Produces: `buildResultModal({ text, pendingNames = [], error = "" }) -> object`

- [ ] **Step 1: Write failing signature tests**

Use a literal body and an independently calculated fixture signature. Assert that the exact body passes, a changed body fails, and a timestamp older than 300 seconds fails.

- [ ] **Step 2: Run signature tests and verify RED**

Run: `node --test tests/slack.test.mjs`

Expected: FAIL because `server/slack.js` does not exist.

- [ ] **Step 3: Implement signature verification and Slack API boundary**

Use `crypto.createHmac("sha256", signingSecret)` over `v0:${timestamp}:${rawBody}` and `timingSafeEqual` only after comparing buffer lengths. `slackApi` sends JSON to `https://slack.com/api/${method}` with bearer authentication and throws using only Slack's error code when `ok !== true`.

- [ ] **Step 4: Write failing modal tests**

Assert a modal title of `SNS용 이모지 변환`, a multiline `plain_text_input` containing the literal converted result, a loading context when `pendingNames` is non-empty, and truncation before Slack's input value limit.

- [ ] **Step 5: Run modal tests and verify RED**

Run: `node --test tests/modal.test.mjs`

Expected: FAIL because `server/modal.js` does not exist.

- [ ] **Step 6: Implement modal builder**

Build a modal with callback ID `emoji_translation_result`, a close button, and an input block whose `plain_text_input` has `multiline: true` and the translated text in `initial_value`. Add Korean copy instructions in a context block. Truncate safely by Unicode code point and append `\n…(Slack 표시 한도로 일부 생략)`.

- [ ] **Step 7: Run both test files**

Run: `node --test tests/slack.test.mjs tests/modal.test.mjs`

Expected: all tests PASS.

### Task 3: 커스텀 이모지 분석과 영구 캐시

**Files:**
- Create: `server/mapping-store.js`
- Create: `server/custom-emoji.js`
- Create: `tests/mapping-store.test.mjs`
- Create: `tests/custom-emoji.test.mjs`
- Create: `package.json`
- Create: `package-lock.json`

**Interfaces:**
- Produces: `createMappingStore(filePath) -> { get(name), set(name, value), snapshot() }`
- Produces: `resolveEmojiUrl(name, emojiIndex) -> string | null`
- Produces: `validateEmojiSuggestion(value) -> string | null`
- Produces: `createCustomEmojiResolver(options).resolve(names) -> Promise<Record<string,string>>`

- [ ] **Step 1: Write failing store tests**

Use a temporary directory. Assert that a missing or malformed JSON file loads as `{}`, `set` survives a second store instance, and stored records contain only `emoji` and `confidence`.

- [ ] **Step 2: Run the store test and verify RED**

Run: `node --test tests/mapping-store.test.mjs`

Expected: FAIL because `server/mapping-store.js` does not exist.

- [ ] **Step 3: Implement the JSON mapping store**

Read lazily, write `${filePath}.tmp`, then rename over the target. Create only the target parent directory. Serialize UTF-8 JSON with two-space indentation and never store images or message text.

- [ ] **Step 4: Write failing custom resolver tests**

Cover a direct URL, `alias:other_name`, cyclic aliases, a cache hit that makes no analyzer call, a successful analyzer result such as `🐉🔥😡`, a four-emoji rejection, and analyzer failure returning `[이름]`.

- [ ] **Step 5: Run resolver tests and verify RED**

Run: `node --test tests/custom-emoji.test.mjs`

Expected: FAIL because `server/custom-emoji.js` does not exist.

- [ ] **Step 6: Implement alias resolution and suggestion validation**

Follow at most 20 `alias:` links while tracking visited names. Validate output with `Intl.Segmenter("ko", { granularity: "grapheme" })`; require 1–3 non-whitespace graphemes and at least one Unicode Emoji property in every grapheme. Return `null` for colon aliases, `□`, `�`, or ordinary text.

- [ ] **Step 7: Implement injected OpenAI analysis**

Fetch the Slack image URL. If it is animated GIF, use `sharp(buffer, { animated: false }).png().toBuffer()` to create a first-frame data URL. Send only the alias name and image via `POST https://api.openai.com/v1/responses`, with `OPENAI_MODEL` (default `gpt-6-luna`), `store: false`, image detail `high`, and strict JSON schema fields `emoji` and `confidence`. If image conversion fails, send the alias name without an image. Accept only confidence `>= 0.55` and a valid suggestion.

- [ ] **Step 8: Add runtime metadata and dependency**

Set `"type": "module"`, `"engines": { "node": ">=20" }`, scripts `test` and `start`, and dependency `sharp`. Run `npm install` to create the lockfile.

- [ ] **Step 9: Run resolver and store tests**

Run: `npm test -- tests/mapping-store.test.mjs tests/custom-emoji.test.mjs`

Expected: all tests PASS.

### Task 4: 메시지 단축어 오케스트레이션과 HTTP 서버

**Files:**
- Create: `server/interaction.js`
- Create: `server/http-server.js`
- Create: `tests/interaction.test.mjs`
- Create: `tests/http-server.test.mjs`

**Interfaces:**
- Produces: `handleShortcut(payload, dependencies) -> Promise<void>`
- Produces: `createApp(options) -> http.RequestListener`

- [ ] **Step 1: Write failing interaction tests**

Use injected `openView`, `updateView`, `listEmoji`, and `resolver`. Assert that the first view opens before unresolved analysis completes, standard aliases are already converted, only unknown names are sent to the resolver, and the final update contains AI results or safe labels.

- [ ] **Step 2: Run interaction tests and verify RED**

Run: `node --test tests/interaction.test.mjs`

Expected: FAIL because `server/interaction.js` does not exist.

- [ ] **Step 3: Implement shortcut handling**

Ignore payloads other than `message_action` with callback ID `translate_sns_emoji`. Translate immediately with the cached snapshot, call `views.open`, resolve only unknown names found in the `emoji.list` index, retranslate with returned mappings, and call `views.update` only if the displayed result changed.

- [ ] **Step 4: Write failing HTTP tests**

Start the real Node listener on an ephemeral port. Assert `/health` returns `{ "ok": true }`, an invalid signature returns 401 without invoking the handler, a mismatched configured team returns 403, and a valid URL-encoded shortcut returns 200 before the injected async handler finishes.

- [ ] **Step 5: Run HTTP tests and verify RED**

Run: `node --test tests/http-server.test.mjs`

Expected: FAIL because `server/http-server.js` does not exist.

- [ ] **Step 6: Implement the HTTP boundary and production wiring**

Limit request bodies to 1 MB. Parse `application/x-www-form-urlencoded`, validate the raw body before JSON parsing, acknowledge valid requests immediately, and execute `handleShortcut` asynchronously with error logging that contains no payload data. On startup require `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN`; require `OPENAI_API_KEY` only when uncached custom analysis occurs.

- [ ] **Step 7: Run the full automated suite**

Run: `npm test`

Expected: all old browser tests and new server tests PASS.

### Task 5: Slack manifest와 운영 안내

**Files:**
- Create: `slack-app-manifest.yaml`
- Create: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Produces: importable Slack app manifest
- Produces: exact local run, deployment, secret, and admin-approval procedure

- [ ] **Step 1: Add the minimal Slack app manifest**

Define display name `SNS 이모지 번역기`, bot user, message shortcut `translate_sns_emoji`, scopes `commands` and `emoji:read`, interactivity request URL `https://YOUR_PUBLIC_HOST/slack/interactions`, and disable socket mode and org-wide deployment.

- [ ] **Step 2: Document environment variables without secrets**

List `PORT`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, optional `SLACK_TEAM_ID`, `OPENAI_API_KEY`, optional `OPENAI_MODEL=gpt-6-luna`, and `DATA_FILE=./data/custom-emoji-map.json` in `.env.example`.

- [ ] **Step 3: Update README with the approval sequence**

Document `npm install`, `npm test`, `npm start`, public HTTPS deployment, manifest URL replacement, Slack app creation, Signing Secret registration, `commands` and `emoji:read` admin approval, bot token registration, restart, and a real-channel smoke test. State that no deployment or approval click can be completed without the user's Slack admin session and hosting secrets.

- [ ] **Step 4: Run final verification**

Run: `npm test && node --check server/http-server.js && git diff --check -- emoji-compat-translator`

Expected: tests pass, syntax exits 0, and diff check prints nothing.

- [ ] **Step 5: Perform a local smoke test**

Start with test secrets, call `/health`, send a correctly signed fixture payload to `/slack/interactions`, and confirm HTTP 200 plus a captured `views.open` call in the fixture server. Do not call real Slack or OpenAI during this smoke test.
