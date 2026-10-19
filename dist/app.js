import {
  loadCustomMap,
  saveCustomMapping,
  translateSlackEmoji,
} from "./translator.js";

const source = document.querySelector("#source");
const result = document.querySelector("#result");
const copyButton = document.querySelector("#copy");
const clearButton = document.querySelector("#clear");
const status = document.querySelector("#status");
const unknownsSection = document.querySelector("#unknowns");
const unknownList = document.querySelector("#unknown-list");
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u;

let customMap = loadCustomMap(localStorage);

function setStatus(message) {
  status.textContent = message;
}

function renderUnknowns(names) {
  unknownList.replaceChildren();
  unknownsSection.hidden = names.length === 0;

  for (const name of names) {
    const row = document.createElement("label");
    row.className = "unknown-item";

    const alias = document.createElement("code");
    alias.textContent = `:${name}:`;

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "text";
    input.autocomplete = "off";
    input.setAttribute("aria-label", `:${name}: 대신 쓸 이모지`);
    input.placeholder = "🙂";
    input.addEventListener("input", () => {
      const emoji = input.value.trim();
      if (!EMOJI.test(emoji)) return;
      customMap = saveCustomMapping(localStorage, name, emoji);
      render();
    });

    row.append(alias, input);
    unknownList.append(row);
  }
}

function render() {
  if (!source.value) {
    result.value = "";
    copyButton.disabled = true;
    renderUnknowns([]);
    setStatus("문구를 붙여넣으면 바로 변환됩니다.");
    return;
  }

  const translated = translateSlackEmoji(source.value, customMap);
  result.value = translated.output;
  copyButton.disabled = false;
  renderUnknowns(translated.unknown);

  setStatus(
    translated.unknown.length
      ? `${translated.convertedCount}개 변환 · ${translated.unknown.length}개는 이름으로 표시`
      : `${translated.convertedCount}개 변환 완료 · 이제 바로 복사할 수 있어요.`,
  );
}

source.addEventListener("input", render);

clearButton.addEventListener("click", () => {
  source.value = "";
  render();
  source.focus();
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(result.value);
    setStatus("복사했습니다. 인스타그램이나 페이스북에 붙여넣으세요.");
    copyButton.firstElementChild.textContent = "복사 완료";
    window.setTimeout(() => {
      copyButton.firstElementChild.textContent = "결과 복사";
    }, 1600);
  } catch {
    result.focus();
    result.select();
    setStatus("선택된 결과를 직접 복사해 주세요.");
  }
});

render();
