import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  // esbuild (vitest's default transform) does not lower Stage-3 / TC39 decorators,
  // which the @Entity/@XField decorators rely on. SWC's '2022-03' decorator transform
  // does, including the context.metadata channel.
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
  test: {
    include: ["test/unit/**/*.test.ts"],
    // Type-level assertions in *.test-d.ts are enforced via `npm run test:types`
    // (tsc -p tsconfig.test.json). Vitest's experimental typecheck did not reliably
    // surface assertion failures in this version, so it is left disabled here.
    typecheck: { enabled: false, include: ["test/unit/**/*.test-d.ts"] },
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
});
