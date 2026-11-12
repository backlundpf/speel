import { describe, it, expect, expectTypeOf } from "vitest";
import { Result, type IError } from "../../src/Result.js";
import { OperationFailedException } from "../../src/errors.js";

const e1: IError = {
  code: "requestFailed",
  message: "boom",
  target: "a",
  status: 500,
};
const e2: IError = { code: "parentFailed", message: "nope" };

describe("Result", () => {
  it("ok carries the value and no errors", () => {
    expect(Result.ok(42)).toEqual({ ok: true, value: 42 });
  });

  it("fail carries every error and no value", () => {
    expect(Result.fail(e1, e2)).toEqual({ ok: false, errors: [e1, e2] });
  });

  it("fail requires at least one error", () => {
    // @ts-expect-error — zero errors is a type error
    expect(() => Result.fail()).toThrow(/at least one/i);
  });

  it("unwrap returns the value of an ok result", () => {
    expect(Result.unwrap(Result.ok("x"))).toBe("x");
  });

  it("unwrap throws OperationFailedException carrying the errors", () => {
    const r = Result.fail<string>(e1, e2);
    expect(() => Result.unwrap(r)).toThrow(OperationFailedException);
    try {
      Result.unwrap(r);
    } catch (err) {
      expect((err as OperationFailedException).errors).toEqual([e1, e2]);
      expect((err as Error).message).toBe("boom; nope");
      expect((err as Error).name).toBe("OperationFailedException");
    }
  });

  it("value is readable unnarrowed and narrows to T on ok", () => {
    const r = Result.ok(1) as Result<number>;
    expectTypeOf(r.value).toEqualTypeOf<number | undefined>();
    if (r.ok) expectTypeOf(r.value).toEqualTypeOf<number>();
    else expectTypeOf(r.errors).toEqualTypeOf<readonly IError[]>();
  });
});
