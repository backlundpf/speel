import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // React 17 ships no `exports` map, so bare `react/jsx-runtime` (used by
      // radix-ui and @tanstack/react-form) won't resolve under Vite — pin the
      // explicit file. React 18/19 don't need this; React 17 does.
      "react/jsx-runtime": "react/jsx-runtime.js",
      "react/jsx-dev-runtime": "react/jsx-dev-runtime.js",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    server: {
      deps: {
        // React 17 has no `exports` map for jsx-runtime, and these deps import
        // it as a bare specifier. Externalized node_modules bypass resolve.alias,
        // so inline them — then Vite transforms them and the alias above applies.
        inline: [
          /@radix-ui\//,
          /radix-ui/,
          /@tanstack\//,
          /@tiptap\//,
          /react-day-picker/,
          /lucide-react/,
        ],
      },
    },
  },
});
