import fs from "node:fs";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error("Usage: node tools/generate-emoji-map.mjs <emoji.json> <output.js>");
  process.exit(1);
}

const entries = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const aliases = new Map();

for (const entry of entries) {
  const emoji = entry.unified
    .split("-")
    .map((codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
    .join("");

  for (const name of entry.short_names) aliases.set(name.toLowerCase(), emoji);
}

// Common workspace emoji names that intentionally resolve to portable Unicode.
aliases.set("approved_stamp", "✅");
aliases.set("party_parrot", "🎉");
aliases.set("shipit", "🚢");

const rows = [...aliases]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, emoji]) => `  ${JSON.stringify(name)}: ${JSON.stringify(emoji)},`)
  .join("\n");

const output = `// Generated from iamcal/emoji-data v16.0.0 (MIT).
// Regenerate with: node tools/generate-emoji-map.mjs emoji.json dist/emoji-map.js
export const EMOJI_MAP = Object.freeze({
${rows}
});
`;

fs.writeFileSync(outputPath, output);
