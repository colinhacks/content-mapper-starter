// The one file to edit. `transform` turns a file into an ES module, written once as TypeScript:
// tsc type-checks the code that imports the file against it, and every runtime and bundler runs it
// with its types stripped. Everything under `kit/` serves this object to each of them.
//
// This example reads INI files: `[section]` headers, `key = value` lines, and comments that start
// with `;` or `#`.
import { defineMapper, type Diagnostic } from "./kit/define.ts";

export default defineMapper({
  name: "ini",
  extensions: [".ini"],
  transform(source) {
    const data: Record<string, unknown> = {};
    const diagnostics: Diagnostic[] = [];
    let section = data;
    let offset = 0;
    for (const line of source.split("\n")) {
      const text = line.trim();
      const header = /^\[([^\]]+)\]$/.exec(text);
      const entry = /^([^=]+?)\s*=\s*(.*)$/.exec(text);
      if (header) data[header[1]!.trim()] = section = {};
      else if (entry) section[entry[1]!] = value(entry[2]!);
      else if (text && !text.startsWith(";") && !text.startsWith("#")) {
        diagnostics.push({ message: `Expected "key = value" or "[section]".`, start: offset + line.indexOf(text), length: text.length });
      }
      offset += line.length + 1;
    }
    // The module: its value for every runtime, and with `as const` its exact type for tsc.
    return { code: `export default ${JSON.stringify(data, null, 2)} as const;\n`, diagnostics };
  },
});

/** A number or a boolean where the text is one, else the text without its quotes. */
function value(text: string): string | number | boolean {
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text === "true" || text === "false") return text === "true";
  return text.replace(/^"(.*)"$/, "$1");
}
