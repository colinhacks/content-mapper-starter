// The Next.js integration, `export default withMapper(nextConfig)` in next.config.ts: the loader
// for Turbopack and webpack, on the server and in the browser, and a type check that runs the
// content mapper inside `next build`.
//
// `next build` type-checks with the project's own tsc, but with arguments of its own, and
// `--runExternalCode` is not among them; TypeScript takes that flag from the command line alone.
// So its check never runs the mapper and fails on every import of a mapped file (TS2307). The
// wrapper turns that check off and runs the same one with the flag in
// `compiler.runAfterProductionCompile`, which Next runs under Turbopack and webpack alike, after
// the compile and before the prerender. Two such wrappers nest: the outer one finds Next's check
// off and adds no second one, and the inner one's tsc runs every content mapper the tsconfig names.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { filter, mapper } from "./run.ts";

type AfterCompile = (metadata: { projectDir: string; distDir: string }) => Promise<void>;

// The part of Next's config the wrapper reads or sets, so that the mapper has no dependency on
// next. Each field's type admits Next's own, and the rest of the config passes through as it is.
// Each level is intersected with `object`: a type of optional properties alone is a weak type,
// against which TypeScript refuses a literal with any other key (`reactStrictMode`,
// `turbopack.root`), and an index signature in its place would refuse Next's own `NextConfig`,
// whose interfaces have none.
type NextConfig = object & {
  typescript?: object & { ignoreBuildErrors?: boolean; tsconfigPath?: string };
  turbopack?: object & { rules?: Record<string, unknown> };
  webpack?: ((config: any, context: any) => any) | null;
  compiler?: object & { runAfterProductionCompile?: AfterCompile };
};

const suffixes = mapper.extensions.map((e) => e.slice(1));
const GLOB = suffixes.length === 1 ? `*.${suffixes[0]}` : `*.{${suffixes.join(",")}}`;

export function withMapper<Config extends NextConfig>(config: Config = {} as Config): Config {
  const { typescript, turbopack, webpack, compiler } = config;
  // A project that turned Next's type check off has turned this one off with it.
  const check = !typescript?.ignoreBuildErrors;
  return {
    ...config,
    turbopack: {
      ...turbopack,
      // Turbopack runs the first rule that matches a file, so the project's own come first.
      rules: { ...turbopack?.rules, [GLOB]: { loaders: [`${packageName()}/turbopack`], as: "*.js" } },
    },
    webpack(webpackConfig: any, context: any) {
      const out = webpack ? webpack(webpackConfig, context) : webpackConfig;
      out.module.rules.push({ test: filter, use: `${packageName()}/webpack` });
      return out;
    },
    ...(check && {
      typescript: { ...typescript, ignoreBuildErrors: true },
      compiler: {
        ...compiler,
        async runAfterProductionCompile(metadata: { projectDir: string; distDir: string }) {
          await compiler?.runAfterProductionCompile?.(metadata);
          await typeCheck(metadata.projectDir, resolve(metadata.projectDir, typescript?.tsconfigPath ?? "tsconfig.json"));
        },
      },
    }),
  } as Config;
}

export default withMapper;

/** This package's name, which the loaders are resolved by, read from its package.json. */
function packageName(): string {
  return (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { name: string }).name;
}

// Next's own check, with `--runExternalCode`: the project's TypeScript, run with this process's
// Node from the project directory.
async function typeCheck(dir: string, tsconfig: string): Promise<void> {
  const require = createRequire(join(dir, "package.json"));
  let manifest: string;
  try {
    manifest = require.resolve("typescript/package.json");
  } catch {
    throw stackless(`The ${mapper.name} content mapper needs TypeScript 7.1 or later, and the project has no TypeScript.`);
  }
  const { version } = JSON.parse(readFileSync(manifest, "utf8")) as { version: string };
  const [major = 0, minor = 0] = version.split(".").map(Number);
  if (major < 7 || (major === 7 && minor < 1)) {
    throw stackless(`The ${mapper.name} content mapper needs TypeScript 7.1 or later; the project has TypeScript ${version}.`);
  }
  // Next writes next-env.d.ts after this hook; `next typegen` writes it on a first build.
  if (!existsSync(join(dir, "next-env.d.ts"))) {
    const next = require.resolve("next/package.json");
    const bin = (JSON.parse(readFileSync(next, "utf8")) as { bin: { next: string } }).bin.next;
    const typegen = await run([join(dirname(next), bin), "typegen", dir], dir);
    if (typegen.code !== 0) throw stackless(`next typegen failed:\n${typegen.output}`);
  }
  const tsc = join(dirname(manifest), "lib", "tsc.js");
  const args = ["--project", tsconfig, "--noEmit", "--declarationMap", "false", "--emitDeclarationOnly", "false", "--runExternalCode"];
  const { code, output } = await run([tsc, ...args], dir);
  // Next's spinner pauses for console output, and not for a write to stdout.
  if (output.trim()) console.log(output.trimEnd());
  if (code !== 0) throw stackless("Failed to type check (tsc --runExternalCode).");
}

// A child Node process's exit code and its output, stdout and stderr in the order they came.
function run(args: string[], cwd: string): Promise<{ code: number; output: string }> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...(process.stdout.isTTY && { FORCE_COLOR: "1" }) },
    });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (output += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (output += chunk));
    child.on("error", fail);
    child.on("close", (code) => done({ code: code ?? 1, output }));
  });
}

// `next build` prints a failed hook's error whole: a stack would point into the mapper, not at the
// errors, which tsc has printed above it.
function stackless(message: string): Error {
  const error = new Error(message);
  error.stack = message;
  return error;
}
