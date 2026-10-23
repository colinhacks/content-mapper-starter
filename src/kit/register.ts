// The preload, for code that runs without a bundler:
//   node --import my-content-mapper/register main.ts
//   bun --preload my-content-mapper/register main.ts      (or `preload` in bunfig.toml)
//   nub --import my-content-mapper/register main.ts       (or `preload` in nub.jsonc)
// Node's load hook and Bun's plugin under `require()` answer synchronously, through `loadSync`.
import { fileURLToPath } from "node:url";
import { workerData } from "node:worker_threads";
import { claims, filter, loadSync, mapper } from "./run.ts";

type BunBuild = { onLoad(options: { filter: RegExp; namespace?: string }, callback: (args: { path: string }) => { loader: "js"; contents: string }): void };
declare const Bun: undefined | { plugin(plugin: { name: string; setup(build: BunBuild): void }): void };

// A worker thread inherits the preload. The one that runs an async transform (`worker.ts`) loads
// no file of the mapper's itself; any other worker gets the hook as the main thread does.
if (!(workerData as { contentMapperWorker?: boolean } | null)?.contentMapperWorker) {
  if (typeof Bun !== "undefined") {
    Bun.plugin({
      name: mapper.name,
      setup(build) {
        build.onLoad({ filter, namespace: "file" }, ({ path }) => ({ loader: "js", contents: loadSync(path) }));
      },
    });
  } else {
    const { registerHooks } = await import("node:module");
    registerHooks({
      load(url, context, nextLoad) {
        if (!url.startsWith("file:") || !claims(url)) return nextLoad(url, context);
        return { format: "module", source: loadSync(fileURLToPath(url)), shortCircuit: true };
      },
    });
  }
}
