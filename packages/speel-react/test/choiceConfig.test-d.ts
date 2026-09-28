/**
 * Type-level assertions for the Choice options config. A `.test-d.ts` because
 * `tsconfig.test.json` compiles these, so a removed member is proven gone by tsc.
 */
import type { FieldConfig } from "@speel/core";

type Choice = Extract<FieldConfig, { kind: "Choice" }>;

// @ts-expect-error — renamed: optionValue is optionsValue, matching hasOptionsValue().
type _NoOptionValue = Choice["optionValue"];

// @ts-expect-error — renamed: optionRender is optionsRender, matching hasOptionsRender().
type _NoOptionRender = Choice["optionRender"];

declare function expectType<T>(value: T): void;
declare const c: Choice;
expectType<((o: unknown) => unknown) | undefined>(c.optionsValue);
expectType<((o: unknown) => unknown) | undefined>(c.optionsRender);
