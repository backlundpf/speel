import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  DbContext,
  ModelBuilder,
  SpeelDocument,
  type IStorageProvider,
  type IFileSystem,
  type IFileUploadRequest,
} from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SurfaceManager } from "../src/surface/SurfaceManager.js";
import { useSurfaces } from "../src/surface/useSurfaces.js";
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

function Harness({ onResult }: { onResult: (r: unknown) => void }) {
  const { showDocumentForm } = useSurfaces();
  return (
    <button
      onClick={() =>
        void showDocumentForm({
          surface: "modal",
          title: "Add artifact",
          entity: new Artifact(),
          mode: "create",
        }).then(onResult)
      }
    >
      open
    </button>
  );
}

function mount(
  provider: IStorageProvider & IFileSystem,
  onResult: (r: unknown) => void,
) {
  const ctx = new DCtx({ provider } as never);
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      <SurfaceManager>
        <Harness onResult={onResult} />
      </SurfaceManager>
    </SpeelProvider>,
  );
}

describe("showDocumentForm", () => {
  it("requires a file inside the surface; uploading resolves submit", async () => {
    const uploads: { folderUrl: string | null; request: IFileUploadRequest }[] =
      [];
    const provider = makeFakeProvider({ Artifacts: [] }, { uploads });
    const onResult = vi.fn();
    mount(provider, onResult);
    fireEvent.click(screen.getByRole("button", { name: "open" }));

    // Save without a file → gate fires, surface stays open, nothing resolves.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByText("A file is required.")).toBeInTheDocument(),
    );
    expect(onResult).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "Q3" },
    });
    fireEvent.change(screen.getByLabelText(/^File/), {
      target: { files: [new File(["x"], "q3.pdf")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.request.fileName).toBe("q3.pdf");
    const result = onResult.mock.calls[0]![0] as {
      action: string;
      entity: Artifact;
    };
    expect(result.action).toBe("submit");
    expect(result.entity.FileLeafRef).toBe("q3.pdf"); // Phase 2 reflection survived the surface
  });

  it("dismissing resolves cancel", async () => {
    const onResult = vi.fn();
    mount(makeFakeProvider({ Artifacts: [] }), onResult);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    fireEvent.click(screen.getByLabelText("Close")); // the fake modal's dismiss control
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({ action: "cancel" }),
      ),
    );
  });
});
