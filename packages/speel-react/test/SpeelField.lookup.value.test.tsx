import { it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  Program?: Program;
  ProgramId?: number;
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

it("stores the picked Program object as the field value", async () => {
  const provider = makeFakeProvider({
    Programs: [
      { ID: 1, Title: "Alpha" },
      { ID: 2, Title: "Beta" },
    ],
  });
  const ctx = new Ctx({ provider } as never);
  const project = Object.assign(new Project(), { Id: 1 });
  let captured: unknown;
  function Inner() {
    const form = useEntityForm(project, "edit");
    captured = form;
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
  // The fake Combobox asks for suggestions as the user types; pick "Beta" from them.
  fireEvent.change(await screen.findByLabelText("Program"), {
    target: { value: "be" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Beta" }));
  await waitFor(() => {
    const v = (
      captured as {
        form: { store: { state: { values: Record<string, unknown> } } };
      }
    ).form.store.state.values.Program;
    expect(v).toMatchObject({ Id: 2, Title: "Beta" });
  });
});

it("shows the current selection when its id is also a loaded option (distinct instances)", async () => {
  // I1 regression: the entity's expanded Program is a different instance than the row the
  // options query returns for the same id. The merge substitutes the value's own instance
  // (by id), so the selection is shown AND offered once, not twice. The identity half is
  // asserted on the resolver in selectionField.test.tsx.
  const provider = makeFakeProvider({
    Programs: [
      { ID: 1, Title: "Alpha" },
      { ID: 2, Title: "Beta" },
    ],
  });
  const ctx = new Ctx({ provider } as never);
  const project = Object.assign(new Project(), {
    Id: 1,
    Program: { Id: 1, Title: "Alpha" },
    ProgramId: 1,
  });
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
  expect((await screen.findByText("Alpha")).tagName).toBe("SPAN");
  fireEvent.change(screen.getByLabelText("Program"), {
    target: { value: "a" },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Beta" })).toBeInTheDocument(),
  );
  expect(screen.getAllByRole("button", { name: "Alpha" })).toHaveLength(1);
});
