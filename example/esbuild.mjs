import { build } from "esbuild";
import contentMapper from "my-content-mapper/esbuild";

await build({ entryPoints: ["src/main.ts"], bundle: true, platform: "node", format: "esm", outfile: "dist/esbuild.mjs", plugins: [contentMapper()] });
