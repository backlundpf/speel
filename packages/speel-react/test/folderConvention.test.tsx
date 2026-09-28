import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DbContext, ModelBuilder, type IBatchOperation } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelForm } from "../src/form/SpeelForm.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class FiledTask {
  Id?: number;
  Title?: string;
  FileDirRef?: string;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(FiledTask, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
      // Explicitly surfaced FileDirRef → the create form shows a Folder input whose
      // value is consumed as the list-relative folder add-option.
      b.property((e) => e.FileDirRef)
        .isText()
        .hasDisplayName("Folder");
    });
  }
}

function setup() {
  const batchOps: IBatchOperation[] = [];
  const ctx = new TCtx({
    provider: makeFakeProvider({ Tasks: [] }, { batchOps }),
  } as never);
  const entity = new FiledTask();
  render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      <SpeelForm entity={entity} mode="create" />
    </SpeelProvider>,
  );
  return { batchOps, entity };
}

describe("FileDirRef folder convention", () => {
  it("consumes the Folder value as the folder add-option and never writes the column", async () => {
    const { batchOps, entity } = setup();
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "Nested" },
    });
    fireEvent.change(screen.getByLabelText(/Folder/), {
      target: { value: "reports/2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(batchOps).toHaveLength(1));
    const op = batchOps[0]!;
    if (op.kind !== "insert")
      throw new Error(`expected insert, got ${op.kind}`);
    expect(op.folderServerRelativeUrl).toBe("/sites/dev/Tasks/reports/2026"); // folder option took effect
    expect(op.fields.map((f) => f.property.columnName)).not.toContain(
      "FileDirRef",
    );
    expect(entity.FileDirRef).toBeUndefined(); // stripped, never applied
  });

  it("an empty Folder value means a plain root add", async () => {
    const { batchOps } = setup();
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "Root" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(batchOps).toHaveLength(1));
    const op = batchOps[0]!;
    if (op.kind !== "insert")
      throw new Error(`expected insert, got ${op.kind}`);
    expect(op.folderServerRelativeUrl).toBeNull();
  });

  it("an invalid folder path surfaces as submitError and tracks nothing", async () => {
    const { batchOps } = setup();
    fireEvent.change(screen.getByLabelText(/Folder/), {
      target: { value: "a/../b" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        screen.getByText(/'\.\.' segments are not allowed/),
      ).toBeInTheDocument(),
    );
    expect(batchOps).toHaveLength(0);
  });
});
