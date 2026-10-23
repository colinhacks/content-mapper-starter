// The shape of a content mapper: what `src/mapper.ts` exports.

/** A problem in the file, at a range of its text given as JavaScript string indices. */
export type Diagnostic = {
  message: string;
  start: number;
  length: number;
  /** A number of the mapper's own, shown after its name (`ini1`). Defaults to 1. */
  code?: number;
};

/** What a file becomes: one ES module written in TypeScript, and any problems found in the file. */
export type Result = {
  code: string;
  diagnostics?: Diagnostic[];
};

export type Mapper = {
  /** Names the mapper in every error, and is the source tsc shows beside its diagnostics. */
  name: string;
  /** The file suffixes the mapper claims, each starting with a dot. A project lists the same ones in its tsconfig.json. */
  extensions: readonly string[];
  /** The module a file becomes. It may be async. */
  transform(source: string, path: string): Result | Promise<Result>;
};

export function defineMapper(mapper: Mapper): Mapper {
  return mapper;
}
