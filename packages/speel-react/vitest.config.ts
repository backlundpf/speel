import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    // Inline TanStack/TipTap so vite transforms them and the jsx-runtime alias below
    // applies (React 17's react/jsx-runtime lacks the ESM exports map the prebuilt
    // ESM expects).
    server: { deps: { inline: [/@tanstack\//, /@tiptap\//] } },
  },
  resolve: {
    alias: {
      "react/jsx-runtime": "react/jsx-runtime.js",
      "react/jsx-dev-runtime": "react/jsx-dev-runtime.js",
    },
  },
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
});
