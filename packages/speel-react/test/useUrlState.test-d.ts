/**
 * Type-level assertions for useUrlState.
 *
 * This is a `.test-d.ts` on purpose: `tsconfig.test.json` compiles `src/**` and
 * `test/**\/*.test-d.ts` only, so a `.test.tsx` is executed by vitest (whose SWC
 * transform strips types without checking them) and never type-checked. The
 * original signature constrained the spec to `UrlCodec<never>`, which cannot
 * accept a mixed spec — `UrlCodec` is invariant in `T`, since `T` appears in both
 * `decode`'s return and `encode`'s parameter. Nothing in the suite caught it;
 * only a consuming app's build did. These assertions live where tsc looks.
 */
import { useUrlState } from "../src/url/useUrlState.js";
import { urlString, urlBoolean, urlNumber } from "../src/url/codecs.js";

declare function expectType<T>(value: T): void;

// A spec mixing codecs of different value types must compile.
const [values, setValues] = useUrlState({
  resnum: urlString({ history: "push" }),
  pendingonly: urlBoolean({ default: true }),
  page: urlNumber({ default: 1 }),
});

// Each key decodes to its codec's value type, not to `never` or `unknown`.
expectType<string | null>(values.resnum);
expectType<boolean>(values.pendingonly);
expectType<number | null>(values.page);

// The setter takes a partial of the same shape.
setValues({ resnum: "R-1" });
setValues({ pendingonly: false });
setValues({ resnum: null, page: 2 });

// @ts-expect-error — a key outside the spec is rejected.
setValues({ nosuchkey: "x" });

// @ts-expect-error — a value of the wrong type for its codec is rejected.
setValues({ pendingonly: "yes" });
