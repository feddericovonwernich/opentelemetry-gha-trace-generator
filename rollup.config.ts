// See: https://rollupjs.org/introduction/

import * as path from "node:path";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import type { RollupOptions } from "rollup";
import license from "rollup-plugin-license";

const config: RollupOptions = {
  input: "src/index.ts",
  output: {
    file: "dist/index.js",
    sourcemap: true,
  },
  plugins: [
    typescript(),
    nodeResolve({
      preferBuiltins: true, // Suppress warnings about preferring built-in modules
    }),
    commonjs({
      transformMixedEsModules: true,
      ignoreDynamicRequires: true, // Suppress eval warnings from dependencies
    }),
    json(),
    license({
      thirdParty: {
        output: path.join("dist", "licenses.txt"),
      },
    }),
  ],
  // Suppress specific warnings
  onwarn(warning, warn) {
    // Ignore "this" rewrite warnings from dependencies
    if (warning.code === "THIS_IS_UNDEFINED") return;
    // Ignore circular dependency warnings from known dependencies
    if (warning.code === "CIRCULAR_DEPENDENCY") {
      if (warning.message.includes("node_modules")) return;
    }
    // Ignore eval warnings from protobufjs (it's safe in this context)
    if (warning.code === "EVAL" && warning.message.includes("protobufjs")) return;
    // Show all other warnings
    warn(warning);
  },
};

export default config;
