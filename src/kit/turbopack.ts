// The Turbopack loader, the webpack loader under its own name:
//   turbopack: { rules: { "*.ini": { loaders: ["my-content-mapper/turbopack"], as: "*.js" } } }
// `withMapper` (`next.ts`) writes that rule for a Next.js project.
export { default } from "./webpack.ts";
