import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  DbContext,
  ModelBuilder,
  SpeelDocument,
  type IFileUploadRequest,
} from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelForm } from "../src/form/SpeelForm.js";
import { SpeelDocumentForm } from "../src/form/SpeelDocumentForm.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

describe("fields disabled while saving (SpeelForm)", () => {
  function setupDeferred() {
    const gate = deferred<void>();
    const provider = makeFakeProvider({ Tasks: [] });
    provider.executeBatchAsync = (ops) =>
      gate.promise.then(() =>
        ops.map((op) => ({
          kind: "success" as const,
          clientToken: op.clientToken,
          serverData: { id: 7 },
        })),
      );
    const ctx = new TCtx({ provider } as never);
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelForm entity={new Task()} mode="create" />
      </SpeelProvider>,
    );
    return gate;
  }

  it("disables fields mid-flight (Cancel stays enabled to abort), re-enables after success", async () => {
    const gate = setupDeferred();
    const title = screen.getByLabelText(/Title/) as HTMLInputElement;
    fireEvent.change(title, { target: { value: "busy" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(title).toBeDisabled());
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled(); // Cancel = abort control

    gate.resolve();
    await waitFor(() => expect(title).not.toBeDisabled());
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();
  });

  it("re-enables with the draft intact after a failed save", async () => {
    const gate = setupDeferred();
    const title = screen.getByLabelText(/Title/) as HTMLInputElement;
    fireEvent.change(title, { target: { value: "kept" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(title).toBeDisabled());

    gate.reject(new Error("boom"));
    await waitFor(() => expect(title).not.toBeDisabled());
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
    expect(title.value).toBe("kept");
  });
});

describe("file input disabled while saving (SpeelDocumentForm)", () => {
  it("disables the FileInput mid-upload and re-enables after", async () => {
    const gate = deferred<void>();
    const provider = makeFakeProvider({ Artifacts: [] });
    provider.uploadFileAsync = async (
      _list,
      folderUrl,
      request: IFileUploadRequest,
    ) => {
      await gate.promise;
      const base = folderUrl ?? "/sites/dev/Artifacts";
      return {
        id: 901,
        fileName: request.fileName,
        serverRelativeUrl: `${base}/${request.fileName}`,
      };
    };
    const ctx = new DCtx({ provider } as never);
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelDocumentForm entity={new Artifact()} mode="create" />
      </SpeelProvider>,
    );

    const fileInput = screen.getByLabelText(/^File/) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["x"], "a.txt")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fileInput).toBeDisabled());
    gate.resolve();
    await waitFor(() => expect(fileInput).not.toBeDisabled());
  });
});
