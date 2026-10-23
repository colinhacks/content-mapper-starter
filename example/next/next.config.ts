import type { NextConfig } from "next";
import withMapper from "my-content-mapper/next";

const nextConfig: NextConfig = {
  // The example's settings file sits beside this app, under the example's own lockfile.
  turbopack: { root: import.meta.dirname + "/.." },
};

export default withMapper(nextConfig);
