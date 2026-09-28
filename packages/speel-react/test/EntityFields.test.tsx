import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DbContext, ModelBuilder, type FormMode } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  useEntityForm,
  EntityFormProvider,
} from "../src/form/useEntityForm.js";
import { EntityFields } from "../src/fields/EntityFields.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Program {
  Id?: number;
  Title?: string;
}
class Project {
  Id?: number;
  Title?: string;
  Ref?: string;
  ProgramId?: number;
  Program?: Program;
}
class Ctx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Program, (b) => {
      b.toList("Programs");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
    });
    mb.entity(Project, (b) => {
      b.toList("Projects");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
      b.property((e) => e.Ref)
        .isText()
        .isReadOnly()
        .hasDisplayName("Reference");
      b.hasOne(Program, (e) => e.Program)
        .withMany()
        .hasForeignKey((e) => e.ProgramId)
        .hasDisplayName("Program");
    });
  }
}
function renderFields(node: JSX.Element, mode: FormMode = "edit") {
  const ctx = new Ctx({
    provider: makeFakeProvider({ Programs: [] }),
  } as never);
  const project = Object.assign(new Project(), {
    Id: 1,
    Title: "P",
    Ref: "R1",
  });
  function Inner() {
    const ef = useEntityForm(project, mode);
    return <EntityFormProvider value={ef as never}>{node}</EntityFormProvider>;
  }
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      <Inner />
    </SpeelProvider>,
  );
}

describe("EntityFields", () => {
  it("renders business fields, omitting the key and nav FK column", () => {
    renderFields(<EntityFields />);
    expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Program/)).toBeInTheDocument(); // the nav, once
    expect(screen.queryByLabelText(/^Id/)).not.toBeInTheDocument(); // key excluded
    expect(screen.queryByLabelText(/ProgramId/)).not.toBeInTheDocument(); // FK column excluded
  });
  it("honors an explicit fields list", () => {
    renderFields(<EntityFields fields={["Title"]} />);
    expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Program/)).not.toBeInTheDocument();
  });
  it("drops excluded fields", () => {
    renderFields(<EntityFields exclude={["Program"]} />);
    expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Program/)).not.toBeInTheDocument();
  });
  it("shows read-only fields in edit mode", () => {
    renderFields(<EntityFields />, "edit");
    expect(screen.getByText("Reference")).toBeInTheDocument();
  });
  it("hides read-only fields in create mode", () => {
    renderFields(<EntityFields />, "create");
    expect(screen.queryByText("Reference")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
  });
});
