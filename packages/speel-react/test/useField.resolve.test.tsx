import { it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  useEntityForm,
  EntityFormProvider,
} from "../src/form/useEntityForm.js";
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
      b.hasOne(Program, (e) => e.Program).withMany();
    });
  }
}

it("resolves an unexpanded ProgramId to the Program object on the form", async () => {
  const provider = makeFakeProvider({ Programs: [{ ID: 7, Title: "Alpha" }] });
  const ctx = new Ctx({ provider } as never);
  const project = Object.assign(new Project(), { Id: 1, ProgramId: 7 }); // FK id, NO expanded object
  let captured: unknown;
  function Inner() {
    const form = useEntityForm(project, "edit");
    captured = form;
    return (
      <EntityFormProvider value={form as never}>
        <div />
      </EntityFormProvider>
    );
  }
  render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      <Inner />
    </SpeelProvider>,
  );
  await waitFor(() => {
    const v = (
      captured as {
        form: { store: { state: { values: Record<string, unknown> } } };
      }
    ).form.store.state.values.Program as { Id?: number } | undefined;
    expect(v?.Id).toBe(7);
  });
});

it("loads an inverse collection (OwnedProjects) for an edit form", async () => {
  class Prog {
    Id?: number;
    Title?: string;
    OwnedProjects?: Proj[];
  }
  class Proj {
    Id?: number;
    Title?: string;
    Program?: Prog;
    ProgramId?: number;
  }
  class InvCtx extends DbContext {
    protected override onModelCreating(mb: ModelBuilder): void {
      mb.entity(Prog, (b) => {
        b.toList("Programs");
        b.property((e) => e.Id).isNumber();
        b.property((e) => e.Title).isText();
        b.hasMany(Proj, (e) => e.OwnedProjects).withOne((p) => p.Program);
      });
      mb.entity(Proj, (b) => {
        b.toList("Projects");
        b.property((e) => e.Id).isNumber();
        b.property((e) => e.Title).isText();
        b.hasOne(Prog, (e) => e.Program).withMany((p) => p.OwnedProjects);
      });
    }
  }
  const provider = makeFakeProvider({
    Projects: [
      { ID: 1, Title: "A" },
      { ID: 2, Title: "B" },
    ],
  });
  const ctx = new InvCtx({ provider } as never);
  const prog = Object.assign(new Prog(), { Id: 9, Title: "P" }); // no OwnedProjects loaded
  let captured: unknown;
  function Inner() {
    const form = useEntityForm(prog, "edit");
    captured = form;
    return (
      <EntityFormProvider value={form as never}>
        <div />
      </EntityFormProvider>
    );
  }
  render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      <Inner />
    </SpeelProvider>,
  );
  await waitFor(() => {
    const v = (
      captured as {
        form: { store: { state: { values: Record<string, unknown> } } };
      }
    ).form.store.state.values.OwnedProjects as { Id?: number }[] | undefined;
    expect(v?.map((c) => c.Id).sort()).toEqual([1, 2]);
  });
});
