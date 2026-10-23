// The webpack loader, which Rspack and Next.js's Turbopack take too (`turbopack.ts`):
//   module.rules: [{ test: /\.ini$/, use: "my-content-mapper/webpack" }]
import { load } from "./run.ts";

type LoaderContext = { resourcePath: string; async(): (error: Error | null, code?: string) => void };

export default function contentMapperLoader(this: LoaderContext, source: string): void {
  const done = this.async();
  load(this.resourcePath, source).then(
    (code) => done(null, code),
    (error: Error) => done(error),
  );
}
