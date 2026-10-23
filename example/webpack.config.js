import { fileURLToPath } from "node:url";

export default {
  mode: "production",
  target: "node",
  entry: "./src/print.js",
  output: { path: fileURLToPath(new URL("dist/webpack", import.meta.url)), filename: "main.cjs" },
  module: { rules: [{ test: /\.ini$/, use: "my-content-mapper/webpack" }] },
};
