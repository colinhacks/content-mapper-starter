// The Jest transformer: `transform: { "\\.ini$": "my-content-mapper/jest" }`. Jest compiles test
// code itself, never through Node's loader, so a preload never sees a file there; it calls the
// transformer synchronously. The module is ESM when Jest runs ES modules (`--experimental-vm-modules`
// with the extension in `extensionsToTreatAsEsm`), and CommonJS otherwise.
import { createHash } from "node:crypto";
import { commonJs } from "./commonjs.ts";
import { loadSync } from "./run.ts";

type Options = { supportsStaticESM?: boolean; configString?: string };

const make = (source: string, path: string, options: Options) => {
  const code = loadSync(path, source);
  return options.supportsStaticESM ? code : commonJs(path, code);
};

// The module `getCacheKey` built, for the `process` call that follows it.
const built = new Map<string, string>();

export default {
  // Jest keeps a transform's output across runs. The key is the module itself, so a change to the
  // mapper builds the file again, which a key on the file alone would not.
  getCacheKey(source: string, path: string, options: Options): string {
    let key: string;
    try {
      key = make(source, path, options);
      built.set(path, key);
    } catch (error) {
      key = String(error);
    }
    return createHash("sha256").update(key).update(String(options.supportsStaticESM)).update(options.configString ?? "").digest("hex");
  },
  process(source: string, path: string, options: Options): { code: string } {
    const code = built.get(path) ?? make(source, path, options);
    built.delete(path);
    return { code };
  },
};
