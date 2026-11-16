import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { IBatchOperation } from "@speel/core";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  useEntityForm,
  EntityFormProvider,
} from "../src/form/useEntityForm.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Notes?: string;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
      b.property((e) => e.Notes)
        .isText()
        .hasDisplayName("Notes");
    });
  }
}

function Harness({ entity }: { entity: Task }) {
  const ef = useEntityForm(entity, "edit");
  return (
    <EntityFormProvider value={ef as never}>
      <button
        onClick={() => {
          ef.form.setFieldValue("Title", "Edited");
          void ef.submit();
        }}
      >
        go
      </button>
      {ef.submitError ? <span role="alert">{ef.submitError}</span> : null}
    </EntityFormProvider>
  );
}

describe("useEntityForm edit + submit", () => {
  it("saves an edit to a loaded row the context does not track, sending only the changed column", async () => {
    const batchOps: IBatchOperation[] = [];
    const ctx = new TCtx({
      provider: makeFakeProvider(
        { Tasks: [{ ID: 7, Title: "Old", Notes: "keep" }] },
        { batchOps },
      ),
    } as never);
    // A row read without tracking, or built by hand: nothing tracks it.
    const entity = Object.assign(new Task(), {
      Id: 7,
      Title: "Old",
      Notes: "keep",
    });
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <Harness entity={entity} />
      </SpeelProvider>,
    );
    fireEvent.click(screen.getByText("go"));

    await waitFor(() => expect(batchOps).toHaveLength(1));
    const op = batchOps[0]!;
    expect(op.kind).toBe("update");
    expect(op.kind === "update" && op.id).toBe(7);
    expect(
      op.kind === "update" && op.fields.map((f) => f.property.propertyName),
    ).toEqual(["Title"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("saves an edit made on a copy of a tracked row", async () => {
    const batchOps: IBatchOperation[] = [];
    const ctx = new TCtx({
      provider: makeFakeProvider(
        { Tasks: [{ ID: 7, Title: "Old", Notes: "keep" }] },
        { batchOps },
      ),
    } as never);
    const [loaded] = await ctx.set(Task).toArrayAsync();
    const draft = Object.assign(new Task(), loaded);
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <Harness entity={draft} />
      </SpeelProvider>,
    );
    fireEvent.click(screen.getByText("go"));

    await waitFor(() => expect(batchOps).toHaveLength(1));
    expect(loaded!.Title).toBe("Edited");
    const op = batchOps[0]!;
    expect(
      op.kind === "update" && op.fields.map((f) => f.property.propertyName),
    ).toEqual(["Title"]);
  });
});
