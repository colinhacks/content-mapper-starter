// Runs webpack with webpack.config.js, as the webpack CLI would.
import webpack from "webpack";
import config from "./webpack.config.js";

webpack(config, (error, stats) => {
  if (error || stats.hasErrors()) {
    console.error(error ?? stats.toString("errors-only"));
    process.exit(1);
  }
});
