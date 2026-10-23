// The kit's own behavior, on stand-in mappers made for each case: an async transform under every
// host that loads modules synchronously, a transform that throws or returns code tsc rejects or no
// runtime can run, and the CommonJS that Jest gets.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as url from "node:url";
import { after, test } from "node:test";
import { commonJs } from "../src/kit/commonjs.ts";

const root = new URL("../", import.meta.url).pathname;
const example = join(root, "example");
if (!existsSync(join(root, "dist"))) throw new Error("Build the kit first: npm run build");
if (!existsSync(join(example, "node_modules"))) throw new Error("Install the example first: npm install --prefix example");
const name = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name: string }).name;
const scratch = mkdtempSync(join(tmpdir(), "content-mapper-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const { NODE_COMPAT: _, ...env } = process.env;
const run = (command: string, args: string[], cwd: string) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env });
  return { status: result.status, stdout: result.stdout.trim(), output: `${result.stdout}${result.stderr}` };
};
const missing = (tool: string) => spawnSync(tool, ["--version"]).status !== 0 && `${tool} is not installed`;
const tsc = (app: string) => run("node", [join(example, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json", "--runExternalCode"], app);

/** A project using a copy of the built kit whose mapper is `mapper`, a JavaScript module claiming `.ini`. */
function project(label: string, mapper: string): string {
  const pkg = join(scratch, label, "pkg");
  const app = join(scratch, label, "app");
  cpSync(join(root, "dist"), join(pkg, "dist"), { recursive: true });
  copyFileSync(join(root, "package.json"), join(pkg, "package.json"));
  writeFileSync(join(pkg, "dist/mapper.js"), mapper);
  mkdirSync(join(app, "node_modules"), { recursive: true });
  symlinkSync(pkg, join(app, "node_modules", name));
  writeFileSync(join(app, "a.ini"), "x = 1\n");
  writeFileSync(join(app, "main.ts"), `import a from "./a.ini";\nconsole.log(JSON.stringify(a));\n`);
  writeFileSync(join(app, "main.cjs"), `console.log(JSON.stringify(require("./a.ini").default));\n`);
  writeFileSync(join(app, "a.test.cjs"), `test("a", () => { expect(require("./a.ini").default).toEqual({ text: "x = 1" }); });\n`);
  writeFileSync(join(app, "jest.config.json"), JSON.stringify({ testMatch: ["<rootDir>/a.test.cjs"], transform: { "\\.ini$": `${name}/jest` } }));
  const compilerOptions = { strict: true, noEmit: true, module: "nodenext", skipLibCheck: true, types: [] };
  writeFileSync(join(app, "tsconfig.json"), JSON.stringify({ compilerOptions, contentMappers: [{ package: name, extensions: [".ini"] }], include: ["main.ts"] }));
  return app;
}

const ASYNC = `export default { name: "ini", extensions: [".ini"], async transform(source) {
  await new Promise((resolve) => setTimeout(resolve, 10));
  return { code: "export default " + JSON.stringify({ text: source.trim() }) + " as const;\\n" };
} };\n`;

test("an async transform, under the hosts that load synchronously", async (t) => {
  const app = project("async", ASYNC);
  const value = JSON.stringify({ text: "x = 1" });
  await t.test("tsc", () => assert.equal(tsc(app).status, 0, tsc(app).output));
  await t.test("node --import", () => assert.equal(run("node", ["--import", `${name}/register`, "main.ts"], app).stdout, value));
  await t.test("node --import, require()", () => assert.equal(run("node", ["--import", `${name}/register`, "main.cjs"], app).stdout, value));
  await t.test("nub --import", { skip: missing("nub") }, () => assert.equal(run("nub", ["--import", `${name}/register`, "main.ts"], app).stdout, value));
  await t.test("bun --preload", { skip: missing("bun") }, () => assert.equal(run("bun", ["--preload", `${name}/register`, "main.ts"], app).stdout, value));
  await t.test("bun --preload, require()", { skip: missing("bun") }, () => assert.equal(run("bun", ["--preload", `${name}/register`, "main.cjs"], app).stdout, value));
  await t.test("jest", () => {
    const result = run("node", [join(example, "node_modules/jest/bin/jest.js"), "--config", "jest.config.json"], app);
    assert.equal(result.status, 0, result.output);
  });
});

test("a transform that returns a promise without being async is refused with the fix", () => {
  const app = project("promise", `export default { name: "ini", extensions: [".ini"], transform: () => Promise.resolve({ code: "export default 1;" }) };\n`);
  const result = run("node", ["--import", `${name}/register`, "main.ts"], app);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /declared async/);
});

test("a type error in the code is reported by tsc", () => {
  const app = project("type-error", `export default { name: "ini", extensions: [".ini"], transform: () => ({ code: 'const n: number = "one";\\nexport default n;\\n' }) };\n`);
  const result = tsc(app);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /a\.ini\(\d+,\d+\): error TS2322/);
});

test("code no runtime can run is reported by tsc, and fails at run time", () => {
  const app = project("enum", `export default { name: "ini", extensions: [".ini"], transform: () => ({ code: "export enum Color { Red }\\nexport default Color.Red;\\n" }) };\n`);
  assert.match(tsc(app).output, /a\.ini\(1,1\): error ini1: The module this file becomes cannot run: TypeScript enum/);
  assert.match(run("node", ["--import", `${name}/register`, "main.ts"], app).output, /ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/);
});

test("a transform that throws is reported by tsc", () => {
  const app = project("throws", `export default { name: "ini", extensions: [".ini"], transform: () => { throw new Error("no parser"); } };\n`);
  assert.match(tsc(app).output, /a\.ini\(1,1\): error ini1: transform threw: no parser/);
});

test("withMapper takes Next.js's own config, typed or written inline, and still types what it reads", () => {
  // Inside the example, so that `next` and the kit resolve from its node_modules.
  const dir = mkdtempSync(join(example, ".next-config-"));
  try {
    writeFileSync(
      join(dir, "check.ts"),
      [
        `import type { NextConfig } from "next";`,
        `import withMapper from "${name}/next";`,
        `const typed: NextConfig = { reactStrictMode: true, turbopack: { root: "/app" } };`,
        `export const a: NextConfig = withMapper(typed);`,
        `export const b = withMapper({ reactStrictMode: true, turbopack: { root: "/app" }, compiler: { removeConsole: true } });`,
        `// @ts-expect-error A field the wrapper reads keeps its type.`,
        `export const c = withMapper({ typescript: { ignoreBuildErrors: "yes" } });`,
      ].join("\n"),
    );
    const compilerOptions = { strict: true, noEmit: true, module: "nodenext", skipLibCheck: true, exactOptionalPropertyTypes: true, types: ["node"] };
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions, files: ["check.ts"] }));
    const result = tsc(dir);
    assert.equal(result.status, 0, result.output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Runs `code` as CommonJS, with `modules` as what each `require` gives. */
function evaluate(code: string, modules: Record<string, unknown> = {}): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  new Function("exports", "require", "__filename", "__dirname", commonJs("/app/x.js", code))(exports, (id: string) => ({ "node:url": url, ...modules })[id], "/app/x.js", "/app");
  return exports;
}

test("CommonJS for Jest: exports", () => {
  const exports = evaluate(`export default { a: 1 };\nexport const b = 2;\nexport function c() { return 3; }\nexport class D {}\nconst e = 5;\nexport { e, e as f };\n`);
  assert.deepEqual(exports.default, { a: 1 });
  assert.equal(exports.b, 2);
  assert.equal((exports.c as () => number)(), 3);
  assert.equal(typeof exports.D, "function");
  assert.equal(exports.e, 5);
  assert.equal(exports.f, 5);
  assert.equal(exports.__esModule, true);
});

test("CommonJS for Jest: imports and re-exports", () => {
  const esm = { __esModule: true, default: "d", named: "n", other: "o" };
  const cjs = { plain: true };
  const exports = evaluate(
    [
      `import d, { named, other as renamed } from "esm";`,
      `import plain from "cjs";`,
      `import * as all from "esm";`,
      `import {\n  named as again,\n} from "esm";`,
      `import "side-effect";`,
      `export { named as reexported } from "esm";`,
      `export * from "star";`,
      `export * as space from "esm";`,
      `export const seen = [d, named, renamed, plain, all.other, again, import.meta.url];`,
    ].join("\n"),
    { esm, cjs, star: { starred: 1, default: "skipped" }, "side-effect": {} },
  );
  assert.deepEqual(exports.seen, ["d", "n", "o", cjs, "o", "n", "file:///app/x.js"]);
  assert.equal(exports.reexported, "n");
  assert.equal(exports.starred, 1);
  assert.equal(exports.default, undefined);
  assert.equal(exports.space, esm);
});

test("CommonJS for Jest: an export it cannot rewrite is refused, not guessed", () => {
  assert.throws(() => commonJs("/app/x.js", `const o = { a: 1 };\nexport const { a } = o;\n`), /cannot turn into CommonJS/);
});
