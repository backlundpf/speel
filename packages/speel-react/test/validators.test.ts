import { describe, it, expect } from "vitest";
import { ModelBuilder, type EntityCtor } from "@speel/core";
import { buildFormErrors } from "../src/form/validators.js";

class Task {
  Id?: number;
  Title?: string;
}

function et() {
  const mb = new ModelBuilder();
  mb.entity(Task, (b) => {
    b.toList("Tasks");
    b.property((e) => e.Id).isNumber();
    b.property((e) => e.Title)
      .isText()
      .isRequired()
      .hasMinLength(3);
  });
  return mb.build().findEntityType(Task as unknown as EntityCtor)!;
}

describe("buildFormErrors", () => {
  it("reports a per-field error for an empty required field", () => {
    const errs = buildFormErrors(et(), { Id: 1, Title: "" }, "edit");
    expect(errs.fields.Title).toMatch(/required/i);
  });
  it("reports the refinement error and clears when valid", () => {
    expect(
      buildFormErrors(et(), { Id: 1, Title: "ab" }, "edit").fields.Title,
    ).toMatch(/at least 3/);
    expect(
      buildFormErrors(et(), { Id: 1, Title: "abc" }, "edit").fields.Title,
    ).toBeUndefined();
  });
});

describe("buildFormErrors — hidden FK columns must not block submit", () => {
  class Program {
    Id?: number;
    Title?: string;
  }
  class Project {
    Id?: number;
    Title?: string;
    Program?: Program;
    ProgramId?: number;
  }

  function projectEt() {
    const mb = new ModelBuilder();
    mb.entity(Program, (b) => {
      b.toList("Programs");
      b.property((e) => e.Title).isText();
    });
    mb.entity(Project, (b) => {
      b.toList("Projects");
      b.property((e) => e.Title)
        .isText()
        .isRequired();
      // A required lookup. EntityFields renders the `Program` nav and HIDES the
      // synthesized `ProgramId` column; the dropdown stores its pick under the nav key.
      b.hasOne(Program, (e) => e.Program)
        .withMany()
        .isRequired(true)
        .hasDisplayName("Program");
    });
    return mb.build().findEntityType(Project as unknown as EntityCtor)!;
  }

  it("validates the nav, not its hidden backing FK column", () => {
    // Title filled and the Program nav picked; the hidden ProgramId column is never
    // set by the UI and must not keep the form invalid (Save disabled) forever.
    const errs = buildFormErrors(
      projectEt(),
      { Title: "New", Program: 5 },
      "create",
    );
    expect(errs.fields.Program).toBeUndefined(); // nav requirement satisfied by the pick
    expect(errs.fields.ProgramId).toBeUndefined(); // hidden FK column must be skipped
    expect(Object.values(errs.fields).every((v) => v === undefined)).toBe(true);
    expect(errs.form).toBeUndefined();
  });
});
