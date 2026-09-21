/**
 * Print the hero at a chosen color mode and width, for eyeballing changes:
 *   npm run preview:hero -- truecolor 80
 *   npm run preview:hero -- none 40
 */
import { render } from "ink";
import { createElement } from "react";

import { Hero } from "../src/ui/components/Hero.js";
import type { ColorMode } from "../src/ui/lib/colors.js";

const mode = (process.argv[2] ?? "truecolor") as ColorMode;
const columns = Number(process.argv[3] ?? process.stdout.columns ?? 80);

render(
  createElement(Hero, {
    name: "monsa",
    tagline: "terminal agent",
    meta: ["claude-opus-5", "v1.0.0", "exit to quit"],
    colorMode: mode,
    columns,
  }),
);
