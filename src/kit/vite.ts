// The Vite plugin, which Vitest takes through the same vite.config and which is a Rolldown and
// Rollup plugin too: `plugins: [contentMapper()]`. One `load` hook; `enforce: "pre"` runs it before
// Vite's own handling of a file type, and `moduleType: "js"` tells Rolldown, which reads a module's
// type from its extension, that the code is JavaScript.
import { claims, load, mapper } from "./run.ts";

export default function contentMapper() {
  return {
    name: mapper.name,
    enforce: "pre" as const,
    async load(id: string) {
      if (!claims(id)) return null;
      return { code: await load(id), map: null, moduleType: "js" };
    },
  };
}
