import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  DbContext,
  ModelBuilder,
  SpeelDocument,
  type IAddOptions,
  type IBatchOperation,
} from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelForm } from "../src/form/SpeelForm.js";
import { SpeelDocumentForm } from "../src/form/SpeelDocumentForm.js";
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
class Artifact extends SpeelDocument {
  Title: string | null = null;
}
class DCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Artifact, (b) => {
      b.toList("Artifacts");
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
    });
  }
}

describe("beforeSubmit on the inline SpeelForm", () => {
  it("runs before the save; a throw keeps the form open and saves nothing", async () => {
    const batchOps: IBatchOperation[] = [];
    const ctx = new TCtx({
      provider: makeFakeProvider({ Tasks: [] }, { batchOps }),
    } as never);
    const beforeSubmit = vi
      .fn()
      .mockRejectedValue(new Error("precheck failed"));
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelForm
          entity={new Task()}
          mode="create"
          beforeSubmit={beforeSubmit}
        />
      </SpeelProvider>,
    );
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByText("precheck failed")).toBeInTheDocument(),
    );
    expect(beforeSubmit).toHaveBeenCalled();
    expect(batchOps).toHaveLength(0);
  });
});

describe("onSubmit override (caller-owned persistence)", () => {
  it("receives the applied entity, skips the built-in save, then onSaved fires", async () => {
    const batchOps: IBatchOperation[] = [];
    const ctx = new TCtx({
      provider: makeFakeProvider({ Tasks: [] }, { batchOps }),
    } as never);
    const onSaved = vi.fn();
    const seen: { title: string | undefined; mode: string }[] = [];
    const onSubmit = vi.fn(async (e: Task, c: { mode: string }) => {
      seen.push({ title: e.Title, mode: c.mode });
    });
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelForm
          entity={new Task()}
          mode="create"
          onSubmit={onSubmit as never}
          onSaved={onSaved}
        />
      </SpeelProvider>,
    );
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "mine" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(seen).toEqual([{ title: "mine", mode: "create" }]); // values applied BEFORE the override
    expect(batchOps).toHaveLength(0); // built-in save skipped
  });

  it("on the document form, addOptions carries the chosen file", async () => {
    const uploads: unknown[] = [];
    const ctx = new DCtx({
      provider: makeFakeProvider(
        { Artifacts: [] },
        { uploads: uploads as never },
      ),
    } as never);
    const captured: IAddOptions[] = [];
    const onSubmit = vi.fn(
      async (_e: Artifact, c: { addOptions: IAddOptions }) => {
        captured.push(c.addOptions);
      },
    );
    const onSaved = vi.fn();
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelDocumentForm
          entity={new Artifact()}
          mode="create"
          onSubmit={onSubmit as never}
          onSaved={onSaved}
        />
      </SpeelProvider>,
    );
    fireEvent.change(screen.getByLabelText(/^File/), {
      target: { files: [new File(["x"], "mine.pdf")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect((captured[0]?.file?.content as File).name).toBe("mine.pdf");
    expect(uploads).toHaveLength(0); // form did not upload
  });
});
