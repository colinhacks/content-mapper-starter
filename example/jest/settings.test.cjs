const expected = require("../expected.json");
const settings = require("../src/settings.ini").default;

test("the file loads under Jest", () => {
  expect(settings).toEqual(expected);
});
