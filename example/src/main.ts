import settings from "./settings.ini";

// The type tsc reads from the content mapper, held exactly: either line fails the check if it differs.
type Expected = { readonly name: "Example"; readonly debug: false; readonly server: { readonly host: "localhost"; readonly port: 8080 } };
const exact: Expected = settings;
const same: typeof settings = exact;
// @ts-expect-error The port is a number.
settings.server.port satisfies string;

console.log(JSON.stringify(same));
