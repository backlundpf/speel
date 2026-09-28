import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
    });
  }
}
function makeCtx() {
  return new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
}

function Harness({ entity }: { entity: Task }) {
  const ef = useEntityForm(entity, "create");
  return (
    <EntityFormProvider value={ef as never}>
      <button onClick={() => void ef.submit()}>go</button>
      {ef.submitError ? <span role="alert">{ef.submitError}</span> : null}
    </EntityFormProvider>
  );
}

describe("useEntityForm create + submit", () => {
  it("adds the entity to its set and saves on create submit", async () => {
    const ctx = makeCtx();
    const addSpy = vi
      .spyOn(ctx.set(Task), "add")
      .mockImplementation((e) => e as never);
    const saveSpy = vi
      .spyOn(ctx, "saveChangesAsync")
      .mockResolvedValue(undefined as never);
    const entity = Object.assign(new Task(), { Title: "New" });
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <Harness entity={entity} />
      </SpeelProvider>,
    );
    fireEvent.click(screen.getByText("go"));
    await waitFor(() => expect(saveSpy).toHaveBeenCalled());
    expect(addSpy).toHaveBeenCalledWith(entity, {}); // empty add-options bag (no file/folder)
  });

  it("surfaces a save failure as submitError", async () => {
    const ctx = makeCtx();
    vi.spyOn(ctx.set(Task), "add").mockImplementation((e) => e as never);
    vi.spyOn(ctx, "saveChangesAsync").mockRejectedValue(new Error("boom"));
    const entity = Object.assign(new Task(), { Title: "New" });
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <Harness entity={entity} />
      </SpeelProvider>,
    );
    fireEvent.click(screen.getByText("go"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
});
