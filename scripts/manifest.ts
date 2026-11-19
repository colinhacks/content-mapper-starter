// Copies the extensions `src/mapper.ts` claims into package.json's `typescript.contentMapper`,
// where tsc reads them for a tsconfig entry that names none. `npm run build` runs it, so the
// manifest a package is published with always matches its mapper.
import { readFileSync, writeFileSync } from "node:fs";
import mapper from "../src/mapper.ts";

const path = new URL("../package.json", import.meta.url);
const text = readFileSync(path, "utf8");
const pkg = JSON.parse(text) as { typescript: { contentMapper: { extensions?: string[] } } };
pkg.typescript.contentMapper.extensions = [...mapper.extensions];
const updated = `${JSON.stringify(pkg, null, 2)}\n`;
if (updated !== text) writeFileSync(path, updated);
