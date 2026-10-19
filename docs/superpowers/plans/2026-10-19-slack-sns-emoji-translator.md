# Slack → SNS 이모지 번역기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slack 이모지 단축어가 포함된 문구를 인스타그램·페이스북 호환 유니코드 이모지 문구로 즉시 바꾸고 복사하는 정적 웹앱을 만든다.

**Architecture:** 브라우저 전용 정적 앱이며, 순수 변환 모듈과 DOM UI를 분리한다. 기본 별칭 사전과 브라우저에 저장한 사용자 매핑을 합쳐 변환하고, 미확인 별칭이 있으면 복사를 막는다.

**Tech Stack:** HTML5, CSS3, JavaScript ES modules, Node.js built-in test runner, browser Clipboard API, localStorage

**Spec:** `emoji-compat-translator/docs/superpowers/specs/2026-10-19-slack-sns-emoji-translator-design.md`

## Global Constraints

- 로그인, 서버, Slack OAuth, 이미지 합성, 직접 SNS 발행은 만들지 않는다.
- 입력 문구는 네트워크로 전송하지 않는다.
- 문장, 공백, 줄바꿈을 보존하고 결과에는 Slack 단축어가 남지 않게 한다.
- 미확인 별칭이 있으면 복사 버튼을 비활성화한다.
- 모바일 단일 열을 기본으로 하고 키보드 포커스, 레이블, 충분한 대비를 제공한다.
- 새 런타임 의존성을 추가하지 않는다.

---

### Task 1: 순수 이모지 변환 모듈

**Files:**
- Create: `emoji-compat-translator/dist/emoji-map.js`
- Create: `emoji-compat-translator/dist/translator.js`
- Create: `emoji-compat-translator/tests/translator.test.mjs`

**Interfaces:**
- Consumes: 기본 Slack 별칭 객체와 `Record<string, string>` 형태의 사용자 매핑
- Produces: `translateSlackEmoji(input, customMap = {}) -> { output: string, convertedCount: number, unknown: string[] }`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { translateSlackEmoji } from "../dist/translator.js";

test("converts aliases and preserves whitespace", () => {
  assert.deepEqual(translateSlackEmoji("출시 :tada:\n가자 :rocket:"), {
    output: "출시 🎉\n가자 🚀",
    convertedCount: 2,
    unknown: [],
  });
});

test("applies custom mappings to repeated aliases", () => {
  assert.deepEqual(translateSlackEmoji(":party_parrot: :party_parrot:", { party_parrot: "🎉" }), {
    output: "🎉 🎉",
    convertedCount: 2,
    unknown: [],
  });
});

test("marks unknown aliases once and leaves ordinary colons alone", () => {
  assert.deepEqual(translateSlackEmoji("회의 10:30 https://a.test :our_stamp:"), {
    output: "회의 10:30 https://a.test □",
    convertedCount: 0,
    unknown: ["our_stamp"],
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test emoji-compat-translator/tests/translator.test.mjs`

Expected: FAIL because `dist/translator.js` does not exist.

- [ ] **Step 3: Add the built-in alias map**

Create `dist/emoji-map.js` exporting `EMOJI_MAP`. Include common Slack names and aliases for faces, gestures, hearts, status, celebration, objects, animals, food, travel, flags, and skin-tone sequences. At minimum include the aliases exercised by the tests:

```js
export const EMOJI_MAP = Object.freeze({
  smile: "😄",
  tada: "🎉",
  rocket: "🚀",
  thumbsup: "👍",
  "+1": "👍",
  heart: "❤️",
  white_check_mark: "✅",
  party_parrot: "🎉",
  approved_stamp: "✅",
  shipit: "🚢",
});
```

- [ ] **Step 4: Implement the minimal pure translator**

```js
import { EMOJI_MAP } from "./emoji-map.js";

const TOKEN = /:([a-zA-Z0-9_+\-]+):/g;

export function translateSlackEmoji(input, customMap = {}) {
  const unknown = new Set();
  let convertedCount = 0;
  const output = input.replace(TOKEN, (_, rawName) => {
    const name = rawName.toLowerCase();
    const emoji = customMap[name] || EMOJI_MAP[name];
    if (!emoji) {
      unknown.add(name);
      return "□";
    }
    convertedCount += 1;
    return emoji;
  });
  return { output, convertedCount, unknown: [...unknown] };
}
```

- [ ] **Step 5: Run the tests**

Run: `node --test emoji-compat-translator/tests/translator.test.mjs`

Expected: 3 tests PASS.

- [ ] **Step 6: Commit the translator**

```bash
git add emoji-compat-translator/dist/emoji-map.js emoji-compat-translator/dist/translator.js emoji-compat-translator/tests/translator.test.mjs
git commit -m "feat: add Slack emoji translation core"
```

### Task 2: 한 화면 변환 UI와 저장된 커스텀 매핑

**Files:**
- Create: `emoji-compat-translator/dist/index.html`
- Create: `emoji-compat-translator/dist/styles.css`
- Create: `emoji-compat-translator/dist/app.js`
- Create: `emoji-compat-translator/tests/storage.test.mjs`
- Modify: `emoji-compat-translator/dist/translator.js`

**Interfaces:**
- Consumes: `translateSlackEmoji(input, customMap)` from Task 1
- Produces: `loadCustomMap(storage)`, `saveCustomMapping(storage, name, emoji)`, and the complete paste → resolve → copy browser flow

- [ ] **Step 1: Write failing storage tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadCustomMap, saveCustomMapping } from "../dist/translator.js";

const memoryStorage = (initial = {}) => ({
  value: initial,
  getItem() { return JSON.stringify(this.value); },
  setItem(_key, value) { this.value = JSON.parse(value); },
});

test("recovers from invalid stored JSON", () => {
  assert.deepEqual(loadCustomMap({ getItem: () => "{" }), {});
});

test("normalizes and saves a custom mapping", () => {
  const storage = memoryStorage({});
  assert.deepEqual(saveCustomMapping(storage, "Party_Parrot", "🎉"), { party_parrot: "🎉" });
});
```

- [ ] **Step 2: Run the storage tests to verify they fail**

Run: `node --test emoji-compat-translator/tests/storage.test.mjs`

Expected: FAIL because the storage functions are not exported.

- [ ] **Step 3: Add storage helpers to `translator.js`**

```js
const STORAGE_KEY = "slack-sns-emoji-map-v1";

export function loadCustomMap(storage) {
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function saveCustomMapping(storage, name, emoji) {
  const next = { ...loadCustomMap(storage), [name.toLowerCase()]: emoji };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
```

- [ ] **Step 4: Run all module tests**

Run: `node --test emoji-compat-translator/tests/*.test.mjs`

Expected: 5 tests PASS.

- [ ] **Step 5: Build the accessible page structure**

Create `index.html` with a labeled input `<textarea id="source">`, live status `<p id="status" aria-live="polite">`, hidden unknown-mapping section `<section id="unknowns">`, read-only result `<textarea id="result" readonly>`, `결과 복사` button, `전체 지우기` button, privacy copy, and ES module script `/app.js`.

- [ ] **Step 6: Implement the browser interaction**

In `app.js`, cache DOM references, load the custom map, and implement one `render()` call that:

```js
const translated = translateSlackEmoji(source.value, customMap);
result.value = translated.output;
copyButton.disabled = !source.value || translated.unknown.length > 0;
status.textContent = translated.unknown.length
  ? `${translated.convertedCount}개 변환 · ${translated.unknown.length}개 선택 필요`
  : `${translated.convertedCount}개 변환 완료`;
```

Render one labeled `<input>` per unknown alias. On input, accept one or more Unicode emoji characters, call `saveCustomMapping(localStorage, name, value.trim())`, update `customMap`, and re-render. Copy with `navigator.clipboard.writeText(result.value)`; on rejection, focus and select the result textarea and show `선택된 결과를 직접 복사해 주세요.` Clear both textareas and status without deleting saved mappings.

- [ ] **Step 7: Add responsive styling**

Create a warm, compact single-column tool with a centered `min(760px, calc(100% - 32px))` container, 16px minimum form text, visible `:focus-visible` outlines, 44px minimum buttons, disabled-button styling, and a two-column input/result layout only above 760px. Use system fonts and CSS only.

- [ ] **Step 8: Perform syntax and module checks**

Run: `node --check emoji-compat-translator/dist/app.js && node --check emoji-compat-translator/dist/translator.js && node --test emoji-compat-translator/tests/*.test.mjs`

Expected: syntax checks exit 0 and all 5 tests PASS.

- [ ] **Step 9: Commit the usable browser app**

```bash
git add emoji-compat-translator/dist emoji-compat-translator/tests/storage.test.mjs
git commit -m "feat: add emoji translator interface"
```

### Task 3: Hosting metadata and end-to-end verification

**Files:**
- Create: `emoji-compat-translator/.openai/hosting.json`
- Create: `emoji-compat-translator/README.md`

**Interfaces:**
- Consumes: completed static files from Tasks 1–2
- Produces: a packageable static Site and concise usage instructions

- [ ] **Step 1: Add the static hosting manifest after Site registration**

Run the Sites registration workflow and persist the returned project ID with `set-project-id.mjs`. Verify that `.openai/hosting.json` has a non-empty `project_id`, and that `static` equals `{ "directory": "dist" }`.

- [ ] **Step 2: Add usage documentation**

Create `README.md` documenting: paste Slack text, resolve only unknown custom aliases, copy the Unicode result, mappings stay in the current browser, and text never leaves the device. Include the test command `node --test tests/*.test.mjs`.

- [ ] **Step 3: Run final automated verification**

Run from `emoji-compat-translator/`:

```bash
node --check dist/app.js
node --check dist/translator.js
node --test tests/*.test.mjs
```

Expected: both syntax checks exit 0 and all tests PASS.

- [ ] **Step 4: Run a local smoke test**

Serve `dist/` with `python3 -m http.server 4173 --directory dist`. Confirm that `curl -fsS http://127.0.0.1:4173/` contains `Slack` and `결과 복사`, then stop the server.

- [ ] **Step 5: Package and publish**

Use the Sites source workflow with `commands: []` and an archive path under `/tmp`, save and deploy the private Site, and wait for a terminal deployment state. Record the literal deployed URL.

- [ ] **Step 6: Commit metadata and documentation**

```bash
git add emoji-compat-translator/.openai/hosting.json emoji-compat-translator/README.md
git commit -m "docs: add emoji translator usage and hosting"
```
