import contentMapper from "my-content-mapper/esbuild";

const result = await Bun.build({ entrypoints: ["src/main.ts"], outdir: "dist/bun", target: "node", plugins: [contentMapper()] });
if (!result.success) throw new AggregateError(result.logs, "Bun.build failed");
