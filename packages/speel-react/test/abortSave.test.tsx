import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  DbContext,
  ModelBuilder,
  SpeelDocument,
  type IFileUploadRequest,
} from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelDocumentForm } from "../src/form/SpeelDocumentForm.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

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

describe("Cancel aborts the in-flight save", () => {
  it("aborts a hung upload: neutral notice, draft intact, onSaved not called", async () => {
    const onSaved = vi.fn();
    const provider = makeFakeProvider({ Artifacts: [] });
    // Hangs until its signal aborts — then rejects like the real provider does.
    provider.uploadFileAsync = (
      _list,
      _folderUrl,
      request: IFileUploadRequest,
    ) =>
      new Promise((_resolve, reject) => {
        request.signal?.addEventListener("abort", () => {
          const e = new Error("File upload aborted.");
          e.name = "AbortError";
          reject(e);
        });
      });
    const ctx = new DCtx({ provider } as never);
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelDocumentForm
          entity={new Artifact()}
          mode="create"
          onSaved={onSaved}
        />
      </SpeelProvider>,
    );

    const title = screen.getByLabelText(/Title/) as HTMLInputElement;
    fireEvent.change(title, { target: { value: "draft" } });
    fireEvent.change(screen.getByLabelText(/^File/), {
      target: { files: [new File(["x"], "a.txt")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(title).toBeDisabled());

    // Cancel is ENABLED mid-flight and aborts the save.
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).not.toBeDisabled();
    fireEvent.click(cancel);

    await waitFor(() =>
      expect(screen.getByText("Save canceled.")).toBeInTheDocument(),
    );
    expect(document.querySelector('[data-intent="error"]')).toBeNull(); // neutral, not a failure
    await waitFor(() => expect(title).not.toBeDisabled());
    expect(title.value).toBe("draft"); // draft intact
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("Cancel when idle still resets the draft (normal role)", async () => {
    const ctx = new DCtx({
      provider: makeFakeProvider({ Artifacts: [] }),
    } as never);
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelDocumentForm entity={new Artifact()} mode="create" />
      </SpeelProvider>,
    );
    const title = screen.getByLabelText(/Title/) as HTMLInputElement;
    fireEvent.change(title, { target: { value: "typed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(title.value).toBe(""));
  });
});

describe("retry after abort", () => {
  it("a save aborted once can be resubmitted and succeeds with a fresh signal", async () => {
    const onSaved = vi.fn();
    const signals: (AbortSignal | undefined)[] = [];
    const provider = makeFakeProvider({ Artifacts: [] });
    let call = 0;
    provider.uploadFileAsync = (
      _list,
      _folderUrl,
      request: IFileUploadRequest,
    ) => {
      call++;
      signals.push(request.signal);
      if (call === 1) {
        // First attempt hangs until aborted, like a long upload being canceled.
        return new Promise((_resolve, reject) => {
          request.signal?.addEventListener("abort", () => {
            const e = new Error("File upload aborted.");
            e.name = "AbortError";
            reject(e);
          });
        });
      }
      return Promise.resolve({
        id: 901,
        fileName: request.fileName,
        serverRelativeUrl: `/sites/dev/Artifacts/${request.fileName}`,
      });
    };
    const ctx = new DCtx({ provider } as never);
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelDocumentForm
          entity={new Artifact()}
          mode="create"
          onSaved={onSaved}
        />
      </SpeelProvider>,
    );

    const title = screen.getByLabelText(/Title/) as HTMLInputElement;
    fireEvent.change(title, { target: { value: "retry me" } });
    fireEvent.change(screen.getByLabelText(/^File/), {
      target: { files: [new File(["x"], "a.txt")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(title).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.getByText("Save canceled.")).toBeInTheDocument(),
    );

    // Retry: must NOT insta-cancel off the first submit's aborted signal.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByText("Save canceled.")).not.toBeInTheDocument();
    expect(signals[1]?.aborted).toBe(false); // fresh signal on the retry
  });
});

describe("retry with a different file", () => {
  it("uploads the CURRENTLY chosen file after an aborted first attempt", async () => {
    const onSaved = vi.fn();
    const names: string[] = [];
    const provider = makeFakeProvider({ Artifacts: [] });
    let call = 0;
    provider.uploadFileAsync = (
      _list,
      _folderUrl,
      request: IFileUploadRequest,
    ) => {
      call++;
      names.push(request.fileName);
      if (call === 1) {
        return new Promise((_resolve, reject) => {
          request.signal?.addEventListener("abort", () => {
            const e = new Error("File upload aborted.");
            e.name = "AbortError";
            reject(e);
          });
        });
      }
      return Promise.resolve({
        id: 902,
        fileName: request.fileName,
        serverRelativeUrl: `/sites/dev/Artifacts/${request.fileName}`,
      });
    };
    const ctx = new DCtx({ provider } as never);
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelDocumentForm
          entity={new Artifact()}
          mode="create"
          onSaved={onSaved}
        />
      </SpeelProvider>,
    );

    const fileInput = screen.getByLabelText(/^File/) as HTMLInputElement;
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "swap" },
    });
    fireEvent.change(fileInput, {
      target: { files: [new File(["1"], "first.pdf")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByLabelText(/Title/)).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.getByText("Save canceled.")).toBeInTheDocument(),
    );

    // Swap the file, then retry: the NEW file must upload.
    fireEvent.change(fileInput, {
      target: { files: [new File(["2"], "second.pdf")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(names).toEqual(["first.pdf", "second.pdf"]);
  });
});
