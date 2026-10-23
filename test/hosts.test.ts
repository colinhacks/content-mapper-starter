// The example project (example/) through every host. Each prints or checks the module the example's
// file becomes, which must equal example/expected.json; tsc must accept the example's types; and
// the broken file (example/broken/) must fail in tsc and at run time, at its line and column.
// A host whose tool is not installed (Bun, nub) is skipped, with the reason.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { test } from "node:test";
import { serve } from "./serve.ts";

const example = new URL("../example/", import.meta.url).pathname;
if (!existsSync(`${example}node_modules`)) throw new Error("Install the example first: npm install --prefix example");
const expected = JSON.stringify(JSON.parse(readFileSync(`${example}expected.json`, "utf8")));

// nub's `node` shim passes NODE_COMPAT on, which would make nub run as plain Node.
const { NODE_COMPAT: _, ...env } = process.env;

function run(command: string, args: string[], cwd = example) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: { ...env, NEXT_TELEMETRY_DISABLED: "1" } });
  return { status: result.status, stdout: result.stdout.trim(), output: `${result.stdout}${result.stderr}${result.error ?? ""}` };
}
const missing = (tool: string) => spawnSync(tool, ["--version"]).status !== 0 && `${tool} is not installed`;
const tsc = "node_modules/typescript/bin/tsc";
const bin = (tool: string) => `${example}node_modules/.bin/${tool}`;

/** Runs a build, then the program it wrote, which must print the expected value. */
function builds(build: [string, string[]], program: string) {
  const built = run(...build);
  assert.equal(built.status, 0, built.output);
  const ran = run("node", [program]);
  assert.equal(ran.stdout, expected, ran.output);
}

test("tsc types the import", () => {
  const result = run("node", [tsc, "-p", "tsconfig.json", "--runExternalCode"]);
  assert.equal(result.status, 0, result.output);
});

test("tsc reports a broken file's problem at its place", () => {
  const result = run("node", [tsc, "-p", "broken/tsconfig.json", "--runExternalCode"]);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /broken\/settings\.ini\(\d+,\d+\): error /);
});

test("node --import", () => {
  const result = run("node", ["--import", "my-content-mapper/register", "src/main.ts"]);
  assert.equal(result.stdout, expected, result.output);
});

test("node --import fails on a broken file, at its place", () => {
  const result = run("node", ["--import", "my-content-mapper/register", "broken/main.ts"]);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /broken\/settings\.ini:\d+:\d+: /);
});

test("nub --import", { skip: missing("nub") }, () => {
  const result = run("nub", ["--import", "my-content-mapper/register", "src/main.ts"]);
  assert.equal(result.stdout, expected, result.output);
});

test("bun --preload", { skip: missing("bun") }, () => {
  const result = run("bun", ["--preload", "my-content-mapper/register", "src/main.ts"]);
  assert.equal(result.stdout, expected, result.output);
});

test("esbuild", () => builds(["node", ["esbuild.mjs"]], "dist/esbuild.mjs"));

test("Bun.build", { skip: missing("bun") }, () => builds(["bun", ["bun-build.ts"]], "dist/bun/main.js"));

test("vite build", () => builds([bin("vite"), ["build"]], "dist/vite/main.js"));

test("rollup", () => builds(["node", ["rollup.mjs"]], "dist/rollup.mjs"));

test("rolldown", () => builds(["node", ["rolldown.mjs"]], "dist/rolldown.mjs"));

test("vitest", () => {
  const result = run(bin("vitest"), ["run"]);
  assert.equal(result.status, 0, result.output);
});

test("webpack", () => builds(["node", ["webpack.mjs"]], "dist/webpack/main.cjs"));

test("jest", () => {
  const result = run(bin("jest"), []);
  assert.equal(result.status, 0, result.output);
});

// A Worker built by Vite with Cloudflare's plugin, run in workerd, Cloudflare's runtime: under the
// dev server, and as the build that `wrangler deploy` uploads.
for (const mode of ["dev", "preview"] as const) {
  test(`cloudflare workers, vite ${mode}`, () => {
    const worker = `${example}worker/`;
    if (mode === "preview") {
      rmSync(`${worker}dist`, { recursive: true, force: true });
      const built = run(bin("vite"), ["build"], worker);
      assert.equal(built.status, 0, built.output);
    }
    const result = run("node", ["--input-type=module", "-e", serve(mode)], worker);
    assert.equal(result.stdout, expected, result.output);
  });
}

for (const bundler of ["turbopack", "webpack"]) {
  test(`next build with ${bundler}`, () => {
    const app = `${example}next/`;
    rmSync(`${app}.next`, { recursive: true, force: true });
    const result = run(bin("next"), bundler === "webpack" ? ["build", "--webpack"] : ["build"], app);
    assert.equal(result.status, 0, result.output);
    // The page prints the value on the server and in a client component, both prerendered.
    const html = readFileSync(`${app}.next/server/app/index.html`, "utf8");
    for (const id of ["server", "client"]) {
      const text = new RegExp(`id="${id}">([^<]*)<`).exec(html)?.[1];
      assert.equal(text?.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&"), expected, id);
    }
  });
}
