// What every runtime and bundler does with a file the mapper claims: run `transform`, fail on its
// diagnostics with each one's line and column, and strip the types from the code, which leaves
// JavaScript. tsc reads the same code with its types (`server.ts`).
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { MessageChannel, receiveMessageOnPort, Worker } from "node:worker_threads";
import mapper from "../mapper.ts";
import type { Result } from "./define.ts";

export { mapper };

declare const Bun: undefined | { Transpiler: new (options: { loader: "ts" }) => { transformSync(code: string): string } };

/** Whether the mapper claims `id`, a path. An id with a query or a hash is left to other plugins. */
export function claims(id: string): boolean {
  return !/[?#]/.test(id) && mapper.extensions.some((extension) => id.endsWith(extension));
}

/** The same test as a RegExp, for esbuild, Bun and webpack, which match with one. */
export const filter = new RegExp(`(?:${mapper.extensions.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`);

/** The JavaScript module the file at `path` becomes. */
export async function load(path: string, source = readFileSync(path, "utf8")): Promise<string> {
  return finish(path, source, await mapper.transform(source, path));
}

/**
 * The same, answered at once, for the hosts that load a module synchronously: Node's and Bun's
 * preload, and Jest. An async `transform` runs on a worker thread while this one waits.
 */
export function loadSync(path: string, source = readFileSync(path, "utf8")): string {
  if (mapper.transform.constructor.name === "AsyncFunction") return finish(path, source, onWorker(path, source));
  const result = mapper.transform(source, path);
  if (typeof (result as Promise<Result>).then === "function") {
    throw new Error(`${mapper.name}: transform returned a promise without being declared async. Write it as \`async transform(source, path)\`, so that the hosts that load modules synchronously know to wait for it on a worker thread.`);
  }
  return finish(path, source, result as Result);
}

/** The code with its types stripped, by the runtime's own stripper: Node's, which it runs `.ts` files with, or Bun's. */
export function javascript(code: string): string {
  if (typeof Bun !== "undefined") return new Bun.Transpiler({ loader: "ts" }).transformSync(code);
  // Node warns once that the function is experimental. The warning is about the API, not the
  // result, which is what Node runs a `.ts` file as, so it is dropped.
  const emit = process.emitWarning;
  process.emitWarning = function (warning: string | Error, ...rest: unknown[]) {
    if (String(typeof warning === "string" ? warning : warning.message).includes("stripTypeScriptTypes")) return;
    return (emit as (...args: unknown[]) => void).call(process, warning, ...rest);
  } as typeof process.emitWarning;
  try {
    return nodeModule.stripTypeScriptTypes(code);
  } finally {
    process.emitWarning = emit;
  }
}

function finish(path: string, source: string, result: Result): string {
  const problems = result.diagnostics ?? [];
  if (problems.length) throw new Error(problems.map((d) => `${mapper.name}: ${path}:${place(source, d.start)}: ${d.message}`).join("\n"));
  return javascript(result.code);
}

/** The line and column, from 1, of a string index into `source`. */
function place(source: string, index: number): string {
  const before = source.slice(0, index);
  return `${before.split("\n").length}:${index - before.lastIndexOf("\n")}`;
}

let worker: Worker | undefined;

/** Runs `transform` on a worker thread (`worker.ts`) and blocks this thread until it answers. */
function onWorker(path: string, source: string): Result {
  // The worker is this file's sibling, compiled (`.js`) or not (`.ts`).
  const extension = import.meta.url.slice(import.meta.url.lastIndexOf("."));
  worker ??= new Worker(new URL(`./worker${extension}`, import.meta.url), { workerData: { contentMapperWorker: true } });
  worker.unref();
  const done = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  worker.postMessage({ path, source, port: port2, done }, [port2]);
  const waited = Atomics.wait(done, 0, 0, 120_000);
  const reply = receiveMessageOnPort(port1)?.message as { result: Result } | { error: string } | undefined;
  port1.close();
  if (!reply) throw new Error(`${mapper.name}: ${path}: the worker ${waited === "timed-out" ? "did not answer in 120 s" : "ended without an answer"}.`);
  if ("error" in reply) throw new Error(reply.error);
  return reply.result;
}
