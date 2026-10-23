import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import contentMapper from "my-content-mapper/vite";

export default defineConfig({ plugins: [contentMapper(), cloudflare()] });
