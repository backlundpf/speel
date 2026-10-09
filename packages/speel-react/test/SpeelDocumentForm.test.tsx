import { describe, it, expect } from "vitest";
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

function setup(
  props: { mode?: "create" | "edit" | "view"; entity?: Artifact } = {},
) {
  const uploads: { folderUrl: string | null; request: IFileUploadRequest }[] =
    [];
  const ctx = new DCtx({
    provider: makeFakeProvider({ Artifacts: [] }, { uploads }),
  } as never);
  const entity = props.entity ?? new Artifact();
  render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      <SpeelDocumentForm entity={entity} mode={props.mode ?? "create"} />
    </SpeelProvider>,
  );
  return { uploads, entity };
}

describe("SpeelDocumentForm (create)", () => {
  it("requires a file: submit without one shows an error and uploads nothing", async () => {
    const { uploads } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "A file is required.",
      ),
    );
    expect(uploads).toHaveLength(0);
  });

  it("submits the chosen file through add(entity, { file }) and reconciles", async () => {
    const { uploads, entity } = setup();
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "Q2" },
    });
    fireEvent.change(screen.getByLabelText(/^File/), {
      target: { files: [new File(["x"], "q2.pdf")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0]!.folderUrl).toBeNull(); // root upload
    expect(uploads[0]!.request.fileName).toBe("q2.pdf"); // name from File.name
    expect(uploads[0]!.request.onProgress).toBeDefined(); // progress wired
    expect(
      (uploads[0]!.request.fields ?? []).map((f) => f.property.columnName),
    ).toContain("Title");
    await waitFor(() => expect(entity.Id).toBe(901)); // save reconciled
    expect(entity.FileLeafRef).toBe("q2.pdf"); // Phase 2 reflection
  });
});

describe("SpeelDocumentForm (view)", () => {
  it("shows the stored file as the skin's link and no file input", () => {
    const doc = Object.assign(new Artifact(), {
      Id: 7,
      Title: "Stored",
      FileLeafRef: "stored.pdf",
      FileRef: "/sites/dev/Artifacts/stored.pdf",
    });
    setup({ mode: "view", entity: doc });
    const link = screen.getByRole("link", { name: "stored.pdf" });
    expect(link).toHaveAttribute("href", "/sites/dev/Artifacts/stored.pdf");
    expect(link).toHaveAttribute("data-fake-link"); // rendered through ui.Link
    expect(screen.queryByLabelText(/^File$/)).not.toBeInTheDocument();
  });
});
