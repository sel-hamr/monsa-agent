/** Environment the agent needs, validated once at startup rather than at the first API call. */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

/* Load .env here rather than via a --env-file flag on each script, so every entry point
   behaves the same — `npm start`, `npm run dev`, and the installed `monsa` binary, which
   is invoked without node flags. The working directory is tried first so an installed
   binary picks up the caller's .env; the one beside the package is the fallback. Values
   already in the real environment always win: Node never overwrites an existing variable. */
const envFiles = new Set([
  resolve(process.cwd(), ".env"),
  fileURLToPath(new URL("../../.env", import.meta.url)),
]);

for (const file of envFiles) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(
    `Invalid environment:\n${details}\n\nCopy .env.example to .env and fill it in.`,
  );
}

export const env = parsed.data;
