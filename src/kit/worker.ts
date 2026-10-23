// The worker thread behind `loadSync` (`run.ts`): it runs an async `transform` while the thread
// that asked waits. The mapper is imported inside the handler, so that a mapper that fails to load
// is an answer and not a worker that never replies.
import { parentPort, type MessagePort } from "node:worker_threads";
import type { Result } from "./define.ts";

type Request = { path: string; source: string; port: MessagePort; done: Int32Array };

parentPort!.on("message", async ({ path, source, port, done }: Request) => {
  let reply: { result: Result } | { error: string };
  try {
    const { default: mapper } = await import("../mapper.ts");
    const result = await mapper.transform(source, path);
    reply = { result: { code: result.code, diagnostics: result.diagnostics } };
  } catch (error) {
    reply = { error: error instanceof Error ? error.message : String(error) };
  }
  port.postMessage(reply);
  port.close();
  Atomics.store(done, 0, 1);
  Atomics.notify(done, 0);
});
