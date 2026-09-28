import { describe, it, expect } from "vitest";
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
  OwnedProjects?: Project[];
}
class Project {
  Id?: number;
  Title?: string;
  Program?: Program;
  ProgramId?: number;
}
class Ctx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Program, (b) => {
      b.toList("Programs");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
      b.hasMany(Project, (e) => e.OwnedProjects).withOne((p) => p.Program);
    });
    mb.entity(Project, (b) => {
      b.toList("Projects");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
      b.hasOne(Program, (e) => e.Program).withMany((p) => p.OwnedProjects);
    });
  }
}

it("renders inverse members and adds one as a child object", async () => {
  const provider = makeFakeProvider({
    Projects: [
      { ID: 1, Title: "A" },
      { ID: 2, Title: "B" },
    ],
  });
  const ctx = new Ctx({ provider } as never);
  const prog = Object.assign(new Program(), {
    Id: 9,
    OwnedProjects: [{ Id: 1, Title: "A" }],
  });
  let captured: unknown;
  function Inner() {
    const form = useEntityForm(prog, "edit");
    captured = form;
    return (
      <EntityFormProvider value={form as never}>
        <SpeelField name="OwnedProjects" />
      </EntityFormProvider>
    );
  }
  render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      <Inner />
    </SpeelProvider>,
  );
  // The current member shows as the combobox's value; typing offers the rest.
  expect((await screen.findByText("A")).tagName).toBe("SPAN");
  fireEvent.change(screen.getByLabelText("OwnedProjects"), {
    target: { value: "b" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "B" })); // add Project B
  await waitFor(() => {
    const v = (
      captured as {
        form: { store: { state: { values: Record<string, unknown> } } };
      }
    ).form.store.state.values.OwnedProjects as { Id?: number }[];
    expect(v.map((c) => c.Id).sort()).toEqual([1, 2]);
  });
});
