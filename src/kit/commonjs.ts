// An ES module as CommonJS, for Jest, which runs CommonJS unless it is started for ES modules. It
// rewrites the import and export statements that open a line, which is where generated code writes
// them, and refuses a module with any it does not recognize rather than guess.

const FROM = String.raw`("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')`;
const STRINGS = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const rule = (source: string) => new RegExp(source, "gm");

export function commonJs(path: string, code: string): string {
  let count = 0;
  const required = (from: string) => {
    const name = `__module${count++}`;
    return { name, line: `const ${name} = require(${from});` };
  };
  // `exports.x = x` for each name the module declares, set once the declarations have run.
  const tail: string[] = [];
  const names = (list: string) =>
    list
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("type "))
      .map((s) => {
        const [local, exported = local] = s.split(/\s+as\s+/);
        return { local: local!, exported: exported! };
      });

  let out = code
    .replace(rule(String.raw`^[ \t]*import\s*${FROM}[ \t]*;?`), (_, from: string) => `require(${from});`)
    .replace(rule(String.raw`^[ \t]*import\s+([^;"'\`]+?)\s+from\s*${FROM}[ \t]*;?`), (_, clause: string, from: string) => {
      const { name, line } = required(from);
      const lines = [line];
      let rest = clause.trim();
      const fallback = /^([\w$]+)\s*(?:,\s*|$)/.exec(rest);
      if (fallback) {
        lines.push(`const ${fallback[1]} = ${name} && ${name}.__esModule ? ${name}.default : ${name};`);
        rest = rest.slice(fallback[0].length);
      }
      const namespace = /^\*\s*as\s+([\w$]+)$/.exec(rest);
      if (namespace) lines.push(`const ${namespace[1]} = ${name};`);
      else if (rest.startsWith("{") && rest.endsWith("}")) {
        lines.push(`const { ${names(rest.slice(1, -1)).map((n) => (n.local === n.exported ? n.local : `${n.local}: ${n.exported}`)).join(", ")} } = ${name};`);
      } else if (rest) return `import ${clause} from ${from};`;
      return lines.join(" ");
    })
    .replace(rule(String.raw`^[ \t]*export\s+default\s+`), "exports.default = ")
    .replace(rule(String.raw`^[ \t]*export\s+(const|let|var)\s+([\w$]+)`), (_, kind: string, name: string) => {
      tail.push(`exports.${name} = ${name};`);
      return `${kind} ${name}`;
    })
    .replace(rule(String.raw`^[ \t]*export\s+((?:async\s+)?function\s*\*?\s*([\w$]+)|class\s+([\w$]+))`), (_, declaration: string, fn?: string, cls?: string) => {
      tail.push(`exports.${fn ?? cls} = ${fn ?? cls};`);
      return declaration;
    })
    .replace(rule(String.raw`^[ \t]*export\s*\*\s*as\s+([\w$]+)\s+from\s*${FROM}[ \t]*;?`), (_, name: string, from: string) => `exports.${name} = require(${from});`)
    .replace(rule(String.raw`^[ \t]*export\s*\*\s*from\s*${FROM}[ \t]*;?`), (_, from: string) => {
      const { name, line } = required(from);
      return `${line} for (const key in ${name}) if (key !== "default" && key !== "__esModule" && !(key in exports)) exports[key] = ${name}[key];`;
    })
    .replace(rule(String.raw`^[ \t]*export\s*\{([^}]*)\}\s*from\s*${FROM}[ \t]*;?`), (_, list: string, from: string) => {
      const { name, line } = required(from);
      return [line, ...names(list).map((n) => `exports.${n.exported} = ${name}.${n.local};`)].join(" ");
    })
    .replace(rule(String.raw`^[ \t]*export\s*\{([^}]*)\}[ \t]*;?`), (_, list: string) => {
      tail.push(...names(list).map((n) => `exports.${n.exported} = ${n.local};`));
      return "";
    });

  // `import.meta`'s three fields have CommonJS equivalents. Strings are stepped over, so no value changes.
  out = out.replace(new RegExp(`${STRINGS.source}|\\bimport\\.meta\\.(url|filename|dirname)\\b`, "g"), (match, field?: string) => {
    if (!field) return match;
    return field === "url" ? `require("node:url").pathToFileURL(__filename).href` : `__${field}`;
  });

  const bare = out.replace(STRINGS, '""');
  if (/^[ \t]*(?:import(?!\s*\()|export)\b/m.test(bare) || /\bimport\.meta\b/.test(bare)) {
    throw new Error(`${path}: the module has an import or export the Jest transformer cannot turn into CommonJS. Run Jest with ES modules (--experimental-vm-modules), or write the statement in one of the forms in commonjs.ts.`);
  }
  return [`"use strict";`, `Object.defineProperty(exports, "__esModule", { value: true });`, out, ...tail, ""].join("\n");
}
