/**
 * Type-level assertions for the field surface's public types. A `.test-d.ts` because
 * `tsconfig.test.json` compiles these, so a type dropped from the package entry is
 * caught by tsc.
 */
import type { FieldHandle, OptionsSource } from "../src/index.js";

declare function expectType<T>(value: T): void;
declare const handle: FieldHandle;
declare const source: OptionsSource;

// A consumer building a handle by hand (a custom body, a test) can name the options type.
expectType<OptionsSource | undefined>(handle.options);
expectType<"list" | "query">(source.mode);
expectType<(query?: string) => Promise<unknown[]>>(source.load);
