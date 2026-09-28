import { describe, it } from "vitest";
import { TextFieldBuilder } from "../../../src/ModelBuilder/fieldTypes/TextFieldBuilder.js";

// These declarations are never executed — `npm run test:types` (tsc -p tsconfig.test.json)
// is the assertion. vitest does not run *.test-d.ts.
//
// Pins what `hasConversion<M, P>`'s two-argument generic signature used to
// guarantee, now carried by `hasCodec<M, P>({ toProvider, fromProvider, ... })`:
// the callback BODIES are checked against M/P, not erased to `unknown`. If the
// generics ever become decorative again, the two `@ts-expect-error` lines below
// stop erroring, and tsc's "unused directive" check fails the build.

interface Status {
  code: string;
  label: string;
}
const STATUSES: readonly Status[] = [
  { code: "draft", label: "Draft" },
  { code: "pub", label: "Published" },
];
function lookup(code: string): Status {
  return STATUSES.find((s) => s.code === code)!;
}

describe("hasCodec<M, P> — body-level type checking", () => {
  it("a correct codec compiles with the callback parameters inferred, no casts", () => {
    new TextFieldBuilder().hasCodec<Status, string>({
      toProvider: (s) => s.code,
      fromProvider: (c) => lookup(c),
    });
  });

  it("fromProvider must return M, not the provider scalar it was handed", () => {
    new TextFieldBuilder().hasCodec<Status, string>({
      toProvider: (s) => s.code,
      // @ts-expect-error — fromProvider must return Status (M), and a bare
      // provider scalar (string) is not one.
      fromProvider: (c) => c,
    });
  });

  it("toProvider's parameter is checked against M, not left as `unknown`", () => {
    new TextFieldBuilder().hasCodec<Status, string>({
      // @ts-expect-error — the parameter's annotated type (number) cannot stand
      // in for M (Status): toProvider's body is checked, not erased.
      toProvider: (s: number) => String(s),
      fromProvider: (c) => lookup(c),
    });
  });
});
