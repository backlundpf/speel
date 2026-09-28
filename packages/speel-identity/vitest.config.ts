import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  // The UserSetting entity carries Stage-3 decorators, and esbuild — vitest's default
  // transform — does not lower them. Same reason and same configuration as @speel/core's.
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: {
          decoratorVersion: "2022-03",
          useDefineForClassFields: true,
        },
        target: "es2022",
      },
    }),
  ],
  test: { environment: "node", globals: true },
});
