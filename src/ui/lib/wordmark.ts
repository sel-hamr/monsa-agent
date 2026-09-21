/**
 * Block-letter wordmark for the hero banner.
 *
 * Each glyph is six rows tall and drawn with two character classes: solid faces
 * (`█ ▄ ▀`) and bevel strokes (`╔ ═ ╗ ║ ╚ ╝`). The renderer colors the two
 * classes differently, which is what gives the mark its cut-metal depth.
 */

export const GLYPH_HEIGHT = 6;

/** Characters that read as the lit face of a letter rather than its bevel. */
const FACE_CHARS = new Set(["█", "▄", "▀"]);

const RAW_GLYPHS: Record<string, string[]> = {
  A: [" █████╗", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
  B: ["██████╗", "██╔══██╗", "██████╔╝", "██╔══██╗", "██████╔╝", "╚═════╝"],
  C: [" ██████╗", "██╔════╝", "██║", "██║", "╚██████╗", " ╚═════╝"],
  D: ["██████╗", "██╔══██╗", "██║  ██║", "██║  ██║", "██████╔╝", "╚═════╝"],
  E: ["███████╗", "██╔════╝", "█████╗", "██╔══╝", "███████╗", "╚══════╝"],
  F: ["███████╗", "██╔════╝", "█████╗", "██╔══╝", "██║", "╚═╝"],
  G: [" ██████╗", "██╔════╝", "██║  ███╗", "██║   ██║", "╚██████╔╝", " ╚═════╝"],
  H: ["██╗  ██╗", "██║  ██║", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
  I: ["██╗", "██║", "██║", "██║", "██║", "╚═╝"],
  J: ["     ██╗", "     ██║", "     ██║", "██   ██║", "╚█████╔╝", " ╚════╝"],
  K: ["██╗  ██╗", "██║ ██╔╝", "█████╔╝", "██╔═██╗", "██║  ██╗", "╚═╝  ╚═╝"],
  L: ["██╗", "██║", "██║", "██║", "███████╗", "╚══════╝"],
  M: ["███╗   ███╗", "████╗ ████║", "██╔████╔██║", "██║╚██╔╝██║", "██║ ╚═╝ ██║", "╚═╝     ╚═╝"],
  N: ["███╗   ██╗", "████╗  ██║", "██╔██╗ ██║", "██║╚██╗██║", "██║ ╚████║", "╚═╝  ╚═══╝"],
  O: [" ██████╗", "██╔═══██╗", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝"],
  P: ["██████╗", "██╔══██╗", "██████╔╝", "██╔═══╝", "██║", "╚═╝"],
  Q: [" ██████╗", "██╔═══██╗", "██║   ██║", "██║▄▄ ██║", "╚██████╔╝", " ╚══▀▀═╝"],
  R: ["██████╗", "██╔══██╗", "██████╔╝", "██╔══██╗", "██║  ██║", "╚═╝  ╚═╝"],
  S: ["███████╗", "██╔════╝", "███████╗", "╚════██║", "███████║", "╚══════╝"],
  T: ["████████╗", "╚══██╔══╝", "   ██║", "   ██║", "   ██║", "   ╚═╝"],
  U: ["██╗   ██╗", "██║   ██║", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝"],
  V: ["██╗   ██╗", "██║   ██║", "██║   ██║", "╚██╗ ██╔╝", " ╚████╔╝", "  ╚═══╝"],
  W: ["██╗    ██╗", "██║    ██║", "██║ █╗ ██║", "██║███╗██║", "╚███╔███╔╝", " ╚══╝╚══╝"],
  X: ["██╗  ██╗", "╚██╗██╔╝", " ╚███╔╝", " ██╔██╗", "██╔╝ ██╗", "╚═╝  ╚═╝"],
  Y: ["██╗   ██╗", "╚██╗ ██╔╝", " ╚████╔╝", "  ╚██╔╝", "   ██║", "   ╚═╝"],
  Z: ["███████╗", "╚══███╔╝", "  ███╔╝", " ███╔╝", "███████╗", "╚══════╝"],
  " ": ["", "", "", "", "", ""],
};

const SPACE_WIDTH = 4;

/** Glyphs padded to a rectangle, so rows can be concatenated without drift. */
const GLYPHS: Record<string, string[]> = Object.fromEntries(
  Object.entries(RAW_GLYPHS).map(([char, rows]) => {
    const width = char === " " ? SPACE_WIDTH : Math.max(...rows.map((row) => row.length));
    return [char, rows.map((row) => row.padEnd(width, " "))];
  }),
);

export function supportsWordmark(text: string): boolean {
  return text.length > 0 && [...text.toUpperCase()].every((char) => char in GLYPHS);
}

/**
 * Render `text` as block letters. Returns null when any character has no glyph,
 * which is the caller's cue to fall back to the compact mark.
 */
export function buildWordmark(text: string): string[] | null {
  if (!supportsWordmark(text)) return null;

  const glyphs = [...text.toUpperCase()].map((char) => GLYPHS[char]!);
  return Array.from({ length: GLYPH_HEIGHT }, (_, row) =>
    glyphs.map((glyph) => glyph[row]!).join("").replace(/\s+$/, ""),
  );
}

export function wordmarkWidth(text: string): number {
  const rows = buildWordmark(text);
  return rows ? Math.max(...rows.map((row) => row.length)) : 0;
}

export type Run = { text: string; face: boolean };

/** Split a rendered row into alternating face and bevel runs. */
export function splitRuns(row: string): Run[] {
  const runs: Run[] = [];
  for (const char of row) {
    const face = FACE_CHARS.has(char);
    const last = runs.at(-1);
    if (last && last.face === face) last.text += char;
    else runs.push({ text: char, face });
  }
  return runs;
}

/** Space out a short label into the tracked-out plate under the wordmark. */
export function track(text: string, gap = " "): string {
  return [...text.toUpperCase()].join(gap);
}
