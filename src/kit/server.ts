// The content mapper process tsc starts (`typescript.contentMapper` in package.json). It answers
// each file with the code `transform` returns, types and all, so the type check sees exactly the
// module every runtime and bundler runs.
import type { Diagnostic, Result } from "./define.ts";
import { javascript, mapper } from "./run.ts";
import { serve } from "./rpc.ts";

// The positions TypeScript reads: JavaScript string indices where it accepts UTF-16, else UTF-8 bytes.
let utf8 = false;

serve({
  initialize(params) {
    const { protocolVersion, positionEncodings } = (params ?? {}) as { protocolVersion?: number; positionEncodings?: string[] };
    utf8 = positionEncodings !== undefined && !positionEncodings.includes("utf-16");
    return { protocolVersion: protocolVersion ?? 1, positionEncoding: utf8 ? "utf-8" : "utf-16", diagnosticSource: mapper.name };
  },
  openProject() {
    return {};
  },
  async transform(params) {
    const { fileName, content } = params as { fileName: string; content: string };
    let result: Result;
    try {
      result = await mapper.transform(content, fileName);
    } catch (error) {
      result = { code: "export {};\n", diagnostics: [{ message: `transform threw: ${error instanceof Error ? error.message : String(error)}`, start: 0, length: 0 }] };
    }
    const diagnostics: Diagnostic[] = [...(result.diagnostics ?? [])];
    // TypeScript accepts every kind of TypeScript, and Node runs only the kind whose types can be
    // erased (no enum, namespace or parameter property). Checked here, so the editor says so.
    try {
      javascript(result.code);
    } catch (error) {
      if ((error as { code?: string }).code === "ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX") {
        diagnostics.push({ message: `The module this file becomes cannot run: ${(error as Error).message.split("\n")[0]}`, start: 0, length: 0 });
      }
    }
    return {
      // An ES module whatever the nearest package.json says, as every runtime loads it.
      extension: ".mts",
      text: result.code,
      diagnostics: diagnostics.map((d) => ({ messageText: d.message, code: d.code ?? 1, ...range(content, d.start, d.length) })),
    };
  },
  closeProject() {
    return {};
  },
});

/** A range of string indices, kept inside the file, in the encoding `initialize` chose. */
function range(content: string, start: number, length: number): { start: number; length: number } {
  const from = Math.min(Math.max(start, 0), content.length);
  const to = Math.min(from + Math.max(length, 0), content.length);
  if (!utf8) return { start: from, length: to - from };
  const bytes = (text: string) => Buffer.byteLength(text, "utf8");
  return { start: bytes(content.slice(0, from)), length: bytes(content.slice(from, to)) };
}
