import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  bevelColor,
  parseHex,
  rampForRows,
  resolveColorMode,
  sampleRamp,
  WORDMARK_RAMP,
} from "../src/ui/lib/colors.js";
import {
  buildWordmark,
  GLYPH_HEIGHT,
  splitRuns,
  supportsWordmark,
  track,
  wordmarkWidth,
} from "../src/ui/lib/wordmark.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

describe("wordmark", () => {
  test("every glyph is a rectangle of the declared height", () => {
    for (const letter of ALPHABET) {
      const rows = buildWordmark(letter);
      assert.ok(rows, `no glyph for ${letter}`);
      assert.equal(rows.length, GLYPH_HEIGHT);
      const widths = new Set(rows.map((row) => row.padEnd(wordmarkWidth(letter)).length));
      assert.equal(widths.size, 1, `${letter} has ragged rows`);
    }
  });

  test("letters compose without drifting out of column", () => {
    const rows = buildWordmark("monsa");
    assert.ok(rows);
    const width = wordmarkWidth("monsa");
    assert.equal(width, 46);
    for (const row of rows) assert.ok(row.length <= width);
  });

  test("case does not matter", () => {
    assert.deepEqual(buildWordmark("monsa"), buildWordmark("MONSA"));
  });

  test("unsupported characters fall back rather than render a hole", () => {
    assert.equal(supportsWordmark("mon5a"), false);
    assert.equal(buildWordmark("mon5a"), null);
    assert.equal(buildWordmark(""), null);
    assert.equal(wordmarkWidth("mon5a"), 0);
  });

  test("runs preserve the row and mark solid glyphs as faces", () => {
    const row = buildWordmark("m")![0]!;
    const runs = splitRuns(row);
    assert.equal(runs.map((run) => run.text).join(""), row);
    assert.ok(runs.some((run) => run.face && run.text.includes("█")));
    assert.ok(runs.every((run) => (run.face ? !run.text.includes("╗") : true)));
  });

  test("track spaces a label out", () => {
    assert.equal(track("agent"), "A G E N T");
  });
});

describe("colors", () => {
  test("ramp samples land on its endpoints", () => {
    const first = WORDMARK_RAMP[0].toLowerCase();
    const last = WORDMARK_RAMP.at(-1)!.toLowerCase();
    assert.equal(sampleRamp(0), first);
    assert.equal(sampleRamp(1), last);
    assert.equal(sampleRamp(-5), first);
    assert.equal(sampleRamp(5), last);
  });

  test("the ramp runs cool to warm", () => {
    const top = parseHex(sampleRamp(0));
    const bottom = parseHex(sampleRamp(1));
    assert.ok(top.b > top.r, "top row should be blue-dominant");
    assert.ok(bottom.r > bottom.b, "bottom row should be warm");
  });

  test("a row gets a color per row, or none when color is off", () => {
    assert.equal(rampForRows(GLYPH_HEIGHT, "truecolor").length, GLYPH_HEIGHT);
    assert.equal(rampForRows(GLYPH_HEIGHT, "ansi16").length, GLYPH_HEIGHT);
    assert.ok(rampForRows(GLYPH_HEIGHT, "none").every((color) => color === undefined));
  });

  test("bevel sits behind its face, and only where hex is available", () => {
    const face = "#2E63F5";
    const bevel = bevelColor(face, "truecolor")!;
    assert.ok(parseHex(bevel).b < parseHex(face).b);
    assert.equal(bevelColor("blue", "ansi16"), "blue");
    assert.equal(bevelColor(undefined, "truecolor"), undefined);
  });

  test("color mode follows the terminal and the environment", () => {
    assert.equal(resolveColorMode({}, 24), "truecolor");
    assert.equal(resolveColorMode({}, 8), "truecolor");
    assert.equal(resolveColorMode({}, 4), "ansi16");
    assert.equal(resolveColorMode({}, undefined), "none", "no TTY means no color");
    assert.equal(resolveColorMode({ NO_COLOR: "1" }, 24), "none");
    assert.equal(resolveColorMode({ NO_COLOR: "" }, 24), "truecolor");
    assert.equal(resolveColorMode({ TERM: "dumb" }, 24), "none");
    assert.equal(resolveColorMode({ FORCE_COLOR: "0" }, 24), "none");
    assert.equal(resolveColorMode({ FORCE_COLOR: "3" }, undefined), "truecolor");
  });
});
