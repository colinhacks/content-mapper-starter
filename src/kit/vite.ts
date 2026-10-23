// The Vite plugin, which Vitest takes through the same vite.config and which is a Rolldown and
// Rollup plugin too: `plugins: [contentMapper()]`. One `load` hook; `enforce: "pre"` runs it before
// Vite's own handling of a file type, and `moduleType: "js"` tells Rolldown, which reads a module's
// type from its extension, that the code is JavaScript.
//
// It resolves a relative import of a file it claims itself too, before any other plugin's
// `resolveId` (`order: "pre"`, wherever it is listed): Cloudflare's Vite plugin makes every `.sql`,
// `.txt` and `.html` import in a Worker a text module in its own `resolveId`, so without this a
// mapper for one of those never sees the file, and the Worker gets the file's text.
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { claims, load, mapper } from "./run.ts";

export default function contentMapper() {
  return {
    name: mapper.name,
    enforce: "pre" as const,
    resolveId: {
      order: "pre" as const,
      handler(source: string, importer: string | undefined): string | null {
        if (importer === undefined || !claims(source) || !/^\.\.?\//.test(source)) return null;
        // An importer may carry a query (`?v=…`), or be a virtual module, whose id is no path.
        const from = importer.replace(/[?#].*$/, "");
        if (!isAbsolute(from)) return null;
        const path = resolve(dirname(from), source);
        return existsSync(path) ? path : null;
      },
    },
    async load(id: string) {
      if (!claims(id)) return null;
      return { code: await load(id), map: null, moduleType: "js" };
    },
  };
}
