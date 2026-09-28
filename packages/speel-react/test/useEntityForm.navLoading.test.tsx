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
  OwnedProjects?: Project[];
}
class Project {
  Id?: number;
  Title?: string;
  Program?: Program;
  ProgramId?: number;
  Sponsor?: Program;
  SponsorId?: number;
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
      // Declared AFTER Program on purpose — navigations() preserves declaration order and
      // the load effect awaits each nav in turn, so Sponsor arriving in the form store is
      // proof the Program iteration already ran to completion. See the skip-guard test.
      b.hasOne(Program, (e) => e.Sponsor).withMany();
    });
  }
}

type Captured = {
  form: { store: { state: { values: Record<string, unknown> } } };
};

function renderForm(ctx: Ctx, entity: object): () => Record<string, unknown> {
  let captured: unknown;
  function Inner() {
    const form = useEntityForm(entity as never, "edit");
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
  return () => (captured as Captured).form.store.state.values;
}

it("loads a reference navigation into form values", async () => {
  const provider = makeFakeProvider({ Programs: [{ ID: 9, Title: "Alpha" }] });
  const ctx = new Ctx({ provider } as never);
  const proj = Object.assign(new Project(), {
    Id: 1,
    Title: "A",
    ProgramId: 9,
  });

  const values = renderForm(ctx, proj);

  await waitFor(() => {
    expect((values().Program as Program | undefined)?.Title).toBe("Alpha");
  });
});

it("loads an inverse collection into form values", async () => {
  const provider = makeFakeProvider({
    Projects: [
      { ID: 1, Title: "A", ProgramId: 9 },
      { ID: 2, Title: "B", ProgramId: 9 },
    ],
  });
  const ctx = new Ctx({ provider } as never);
  const prog = Object.assign(new Program(), { Id: 9, Title: "Alpha" });

  const values = renderForm(ctx, prog);

  await waitFor(() => {
    const kids = values().OwnedProjects as Project[] | undefined;
    expect(kids?.map((c) => c.Id).sort()).toEqual([1, 2]);
  });
});

// The form-level skip guard is the ONLY thing protecting a pending user assignment —
// the design deliberately declines to use the entry's isLoaded for it. So the wait here
// has to key on something the load itself produces: Title is populated synchronously at
// form init and would let the assertion run before the effect ever touched the nav.
// Sponsor is only ever set BY the load, and it is the nav declared after Program, so once
// it appears the sequential effect has provably finished with Program.
it("does not overwrite a navigation the user already assigned", async () => {
  const provider = makeFakeProvider({ Programs: [{ ID: 9, Title: "Stored" }] });
  const ctx = new Ctx({ provider } as never);
  const chosen = Object.assign(new Program(), { Id: 9, Title: "User pick" });
  const proj = Object.assign(new Project(), {
    Id: 1,
    Title: "A",
    ProgramId: 9,
    Program: chosen,
    SponsorId: 9,
  });

  const values = renderForm(ctx, proj);

  await waitFor(() =>
    expect((values().Sponsor as Program | undefined)?.Title).toBe("Stored"),
  );
  expect(values().Program).toBe(chosen);
  expect((values().Program as Program).Title).toBe("User pick");
});
