import { describe, it, expect } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  useEntityForm,
  EntityFormProvider,
} from "../src/form/useEntityForm.js";
import { SpeelField } from "../src/fields/SpeelField.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Program {
  Id?: number;
  Title?: string;
}
class Project {
  Id?: number;
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
      b.hasOne(Program, (e) => e.Program)
        .withMany()
        .hasForeignKey((e) => e.ProgramId)
        .hasDisplayField((p) => p.Title)
        .hasDisplayName("Program");
    });
  }
}

describe("SpeelField Lookup", () => {
  it("loads options from the target set into the combobox", async () => {
    const provider = makeFakeProvider({
      Programs: [
        { ID: 1, Title: "Alpha" },
        { ID: 2, Title: "Beta" },
      ],
    });
    const ctx = new Ctx({ provider } as never);
    const project = Object.assign(new Project(), { Id: 1 });
    function Inner() {
      const form = useEntityForm(project, "edit");
      return (
        <EntityFormProvider value={form as never}>
          <SpeelField name="Program" />
        </EntityFormProvider>
      );
    }
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <Inner />
      </SpeelProvider>,
    );
    // Both programs contain an "a", so typing it offers the whole target set.
    fireEvent.change(await screen.findByLabelText("Program"), {
      target: { value: "a" },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Beta" })).toBeInTheDocument();
  });
});
