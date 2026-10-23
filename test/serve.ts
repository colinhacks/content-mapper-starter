// A script that starts Vite's dev server, or its preview of the build, on a free port, prints what
// `/` answers, and stops. Run with `node --input-type=module -e` in the project's directory, so that
// `vite` resolves from there.
export function serve(mode: "dev" | "preview"): string {
  const start = mode === "preview" ? `await preview({ preview: { port: 0 }, logLevel: "error" })` : `await (await createServer({ server: { port: 0 }, logLevel: "error" })).listen()`;
  return [
    `import { createServer, preview } from "vite";`,
    `const server = ${start};`,
    `const response = await fetch(server.resolvedUrls.local[0]);`,
    `console.log(await response.text());`,
    `await server.close();`,
  ].join("\n");
}
