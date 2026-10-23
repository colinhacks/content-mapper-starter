// The esbuild plugin, which `Bun.build` takes too: `plugins: [contentMapper()]`.
import { filter, load, mapper } from "./run.ts";

type Build = { onLoad(options: { filter: RegExp; namespace?: string }, callback: (args: { path: string }) => Promise<{ contents: string; loader: "js" }>): void };

export default function contentMapper() {
  return {
    name: mapper.name,
    setup(build: Build) {
      build.onLoad({ filter, namespace: "file" }, async ({ path }) => ({ contents: await load(path), loader: "js" }));
    },
  };
}
