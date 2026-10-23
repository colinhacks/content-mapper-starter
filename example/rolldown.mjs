import { rolldown } from "rolldown";
import contentMapper from "my-content-mapper/vite";

const bundle = await rolldown({ input: "src/print.js", platform: "node", plugins: [contentMapper()] });
await bundle.write({ file: "dist/rolldown.mjs", format: "es" });
