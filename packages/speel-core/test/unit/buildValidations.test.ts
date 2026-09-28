import { describe, it, expect } from "vitest";
import {
  buildValidations,
  refinementRulesFor,
} from "../../src/Metadata/buildValidations.js";
import { collectErrors } from "../../src/Forms/resolve.js";
import type { FieldConfig } from "../../src/Metadata/FieldConfig.js";
import type { FieldContext } from "../../src/types.js";

const ctx = (value: unknown): FieldContext => ({
  values: {},
  value,
  mode: "edit",
});
const textConfig: FieldConfig = {
  kind: "Text",
  multiline: false,
  minLength: 3,
  maxLength: 5,
};

describe("refinementRulesFor", () => {
  it("derives minLength/maxLength from Text config", () => {
    const rules = refinementRulesFor(textConfig, "Title");
    expect(rules).toHaveLength(2);
    expect(rules.some((r) => !r.validate(ctx("ab")))).toBe(true); // < min
    expect(rules.some((r) => !r.validate(ctx("abcdef")))).toBe(true); // > max
  });
  it("derives min/max from Number config", () => {
    expect(
      refinementRulesFor({ kind: "Number", min: 1, max: 9 }, "N"),
    ).toHaveLength(2);
  });
  it("Boolean config yields no refinement rules", () => {
    expect(refinementRulesFor({ kind: "Boolean" }, "B")).toHaveLength(0);
  });
  it("Choice yields a membership rule, but NOT when fillIn is true", () => {
    const base = {
      options: ["a", "b"] as const,
      radioButtons: false,
    };
    expect(
      refinementRulesFor({ kind: "Choice", ...base, fillIn: false }, "C"),
    ).toHaveLength(1);
    expect(
      refinementRulesFor({ kind: "Choice", ...base, fillIn: true }, "C"),
    ).toHaveLength(0);
  });
  it("a Choice whose list is not literal is an open column: no membership rule", () => {
    const open = { multi: false, fillIn: false, radioButtons: false };
    expect(
      refinementRulesFor(
        { kind: "Choice", ...open, options: () => ["a"] },
        "C",
      ),
    ).toHaveLength(0);
    expect(
      refinementRulesFor(
        { kind: "Choice", ...open, optionsQueryAsync: async () => ["a"] },
        "C",
      ),
    ).toHaveLength(0);
  });
  it("a Choice declaring a literal list AND a query is open: the query wins, as in the UI", () => {
    const open = { multi: false, fillIn: false, radioButtons: false };
    const rules = refinementRulesFor(
      {
        kind: "Choice",
        ...open,
        options: ["a", "b"],
        optionsQueryAsync: async () => ["z"],
      },
      "C",
    );
    // A value the query offered but the literal list lacks must still save.
    expect(rules).toHaveLength(0);
  });
});

describe("buildValidations", () => {
  it("composes required + refinement + custom", () => {
    const custom = {
      validate: (c: FieldContext) => c.value !== "bad",
      message: "no bad",
    };
    const rules = buildValidations({
      config: textConfig,
      required: true,
      displayName: "Title",
      customValidations: [custom],
    });
    // required(1) + minLength(1) + maxLength(1) + custom(1)
    expect(rules).toHaveLength(4);
    expect(rules.some((r) => !r.validate(ctx("")))).toBe(true); // required fails empty
    expect(rules.some((r) => !r.validate(ctx("bad")))).toBe(true); // custom fails
  });
  it("omits required rule when isRequired is false", () => {
    const rules = buildValidations({
      config: { kind: "Boolean" },
      required: false,
      displayName: "B",
      customValidations: [],
    });
    expect(rules).toHaveLength(0);
  });
  it("works with no config (navigation-style field)", () => {
    const rules = buildValidations({
      required: true,
      displayName: "Owner",
      customValidations: [],
    });
    expect(rules).toHaveLength(1); // just required
  });
});

describe("buildValidations: a Choice's option list may not be literal", () => {
  const choiceField = (config: FieldConfig) => ({
    config,
    required: false as const,
    displayName: "C",
    customValidations: [],
  });

  it("a thunk-sourced Choice has no membership rule", () => {
    const errs = collectErrors(
      buildValidations(
        choiceField({
          kind: "Choice",
          multi: false,
          fillIn: false,
          radioButtons: false,
          options: () => ["A"],
        }),
      ),
      { values: {}, value: "Z", mode: "edit" },
    );
    expect(errs).toEqual([]);
  });

  it("a queried Choice has no membership rule", () => {
    const errs = collectErrors(
      buildValidations(
        choiceField({
          kind: "Choice",
          multi: false,
          fillIn: false,
          radioButtons: false,
          optionsQueryAsync: async () => ["A"],
        }),
      ),
      { values: {}, value: "Z", mode: "edit" },
    );
    expect(errs).toEqual([]);
  });

  it("a literal Choice still refuses a value outside its list", () => {
    const errs = collectErrors(
      buildValidations(
        choiceField({
          kind: "Choice",
          multi: false,
          fillIn: false,
          radioButtons: false,
          options: ["A", "B"],
        }),
      ),
      { values: {}, value: "Z", mode: "edit" },
    );
    expect(errs).toHaveLength(1);
  });
});
