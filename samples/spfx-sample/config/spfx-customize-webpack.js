"use strict";

const path = require("path");

/**
 * SPFx webpack customization hook (loaded by customize-configure-webpack heft task).
 *
 * Fix 1 — resolve.alias for '@':
 *   TypeScript paths don't carry through to compiled JS. Webpack must resolve
 *   '@/' → 'lib/' so the speel-shadcn skin's internal imports
 *   ('@/components/ui/*', '@/lib/utils') resolve in the bundle.
 *
 * Fix 2 — fullySpecified: false for .mjs:
 *   Radix-ui ships ESM as .mjs files that import 'react/jsx-runtime' without
 *   extension. Webpack 5 strict ESM mode requires fully-specified paths for
 *   .mjs modules. This rule mirrors the SPFx rig's existing JS rule to apply
 *   fullySpecified:false to .mjs files too.
 *
 * @param {import('webpack').Configuration} config
 */
module.exports = function (config) {
  // Fix 1: @ alias points to lib (webpack runs on compiled lib/ output)
  if (!config.resolve) config.resolve = {};
  if (!config.resolve.alias) config.resolve.alias = {};
  config.resolve.alias["@"] = path.resolve(__dirname, "..", "lib");

  // Fix 2: allow bare specifiers (no extension) in .mjs ESM modules
  if (!config.module) config.module = {};
  if (!config.module.rules) config.module.rules = [];
  config.module.rules.push({
    test: /\.mjs$/,
    resolve: { fullySpecified: false },
  });
};
