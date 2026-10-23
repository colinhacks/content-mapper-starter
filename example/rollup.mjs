import { rollup } from "rollup";
import contentMapper from "my-content-mapper/vite";

const bundle = await rollup({ input: "src/print.js", plugins: [contentMapper()] });
await bundle.write({ file: "dist/rollup.mjs", format: "es" });
