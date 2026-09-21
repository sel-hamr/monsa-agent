/** Color handling for the hero banner: capability detection and the wordmark ramp. */

export type ColorMode = "truecolor" | "ansi16" | "none";

export type Rgb = { r: number; g: number; b: number };

/**
 * Vertical ramp for the wordmark, top row to bottom row: ultramarine cooling
 * through steel into gold. Sampled, so it survives a change of glyph height.
 */
export const WORDMARK_RAMP = [
  "#2E63F5",
  "#3A6CF2",
  "#5F87E8",
  "#B9A96B",
  "#E0BE3C",
  "#F5CE2B",
] as const;

/** Sixteen-color stand-in for the ramp, used when the terminal has no hex. */
const WORDMARK_RAMP_ANSI16 = [
  "blue",
  "blue",
  "cyan",
  "yellow",
  "yellow",
  "yellowBright",
] as const;

export const SUBTITLE_COLOR = "#C9A227";

/** How much of a row's color a bevel glyph keeps, versus a solid face glyph. */
const SHADOW_FACTOR = 0.4;

export function parseHex(hex: string): Rgb {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const channel = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function mix(from: Rgb, to: Rgb, t: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t,
  };
}

/** Sample the ramp at `t` in [0, 1], interpolating between adjacent stops. */
export function sampleRamp(t: number, stops: readonly string[] = WORDMARK_RAMP): string {
  if (stops.length === 0) throw new Error("sampleRamp needs at least one stop");
  if (stops.length === 1) return toHex(parseHex(stops[0]!));

  const clamped = Math.min(1, Math.max(0, t));
  const position = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(position));
  return toHex(
    mix(parseHex(stops[index]!), parseHex(stops[index + 1]!), position - index),
  );
}

/** One color per row of a wordmark `rows` tall. */
export function rampForRows(rows: number, mode: ColorMode): (string | undefined)[] {
  if (mode === "none") return Array.from({ length: rows }, () => undefined);

  if (mode === "ansi16") {
    return Array.from({ length: rows }, (_, row) => {
      const index = Math.round((row / Math.max(1, rows - 1)) * (WORDMARK_RAMP_ANSI16.length - 1));
      return WORDMARK_RAMP_ANSI16[index]!;
    });
  }

  return Array.from({ length: rows }, (_, row) => sampleRamp(row / Math.max(1, rows - 1)));
}

/** The bevel tone for a face color: same hue, pushed back into the terminal. */
export function bevelColor(face: string | undefined, mode: ColorMode): string | undefined {
  if (!face || mode !== "truecolor") return face;
  const { r, g, b } = parseHex(face);
  return toHex({ r: r * SHADOW_FACTOR, g: g * SHADOW_FACTOR, b: b * SHADOW_FACTOR });
}

export type ColorModeEnv = {
  NO_COLOR?: string | undefined;
  FORCE_COLOR?: string | undefined;
  TERM?: string | undefined;
};

/**
 * Resolve how much color the banner may use. `depth` is the terminal's reported
 * color depth in bits (as `tty.WriteStream#getColorDepth` reports it).
 */
export function resolveColorMode(env: ColorModeEnv, depth: number | undefined): ColorMode {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return "none";
  if (env.TERM === "dumb") return "none";
  if (env.FORCE_COLOR === "0") return "none";
  if (env.FORCE_COLOR === "1" || env.FORCE_COLOR === "2") return "ansi16";
  if (env.FORCE_COLOR === "3") return "truecolor";
  if (depth === undefined || depth <= 1) return "none";
  if (depth >= 8) return "truecolor";
  return "ansi16";
}

/** Color mode for the current process, from its stdout and environment. */
export function detectColorMode(stream: NodeJS.WriteStream = process.stdout): ColorMode {
  const depth =
    typeof stream?.getColorDepth === "function" && stream.isTTY
      ? stream.getColorDepth()
      : undefined;
  return resolveColorMode(process.env, depth);
}
