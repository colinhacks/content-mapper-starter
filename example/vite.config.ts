import { defineConfig } from "vite";
import contentMapper from "my-content-mapper/vite";

export default defineConfig({
  plugins: [contentMapper()],
  build: { ssr: "src/main.ts", outDir: "dist/vite" },
  test: { include: ["src/*.test.ts"] },
});
