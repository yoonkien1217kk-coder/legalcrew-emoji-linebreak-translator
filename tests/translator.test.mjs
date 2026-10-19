import test from "node:test";
import assert from "node:assert/strict";

import {
  extractSlackEmojiNames,
  translateSlackEmoji,
} from "../dist/translator.js";

test("converts aliases and preserves whitespace", () => {
  assert.deepEqual(translateSlackEmoji("출시 :tada:\n가자 :rocket:"), {
    output: "출시 🎉\n가자 🚀",
    convertedCount: 2,
    unknown: [],
  });
});

test("applies custom mappings to repeated aliases", () => {
  assert.deepEqual(
    translateSlackEmoji(":party_parrot: :party_parrot:", {
      party_parrot: "🎉",
    }),
    {
      output: "🎉 🎉",
      convertedCount: 2,
      unknown: [],
    },
  );
});

test("marks unknown aliases once and leaves ordinary colons alone", () => {
  assert.deepEqual(
    translateSlackEmoji("회의 10:30 https://a.test :our_stamp:"),
    {
      output: "회의 10:30 https://a.test [our stamp]",
      convertedCount: 0,
      unknown: ["our_stamp"],
    },
  );
});

test("converts Slack standard aliases including gender and profession sequences", () => {
  const input =
    ":smiley::expressionless::woman-facepalming::blush::smirk::scientist::skin-tone-2::stuck_out_tongue_winking_eye:";

  assert.deepEqual(translateSlackEmoji(input), {
    output: "😃😑🤦‍♀️😊😏🧑🏻‍🔬😜",
    convertedCount: 8,
    unknown: [],
  });
});

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
