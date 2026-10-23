import { expect, test } from "vitest";
import expected from "../expected.json" with { type: "json" };
import settings from "./settings.ini";

test("the file loads under Vitest", () => {
  expect(settings).toEqual(expected);
});
