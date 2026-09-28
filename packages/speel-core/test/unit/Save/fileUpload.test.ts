import { describe, it, expect, vi } from "vitest";
import { resolveStagedFile } from "../../../src/Save/fileUpload.js";
import { InvalidOperationException } from "../../../src/errors.js";

describe("resolveStagedFile", () => {
  it("uses the explicit name and defaults overwrite to false", () => {
    const staged = resolveStagedFile({ name: "q2.pdf", content: "data" });
    expect(staged.fileName).toBe("q2.pdf");
    expect(staged.content).toBe("data");
    expect(staged.overwrite).toBe(false);
    expect(staged.onProgress).toBeUndefined();
    expect(staged.signal).toBeUndefined();
  });

  it("defaults the name from a File when no explicit name is given", () => {
    const f = new File(["x"], "report.docx");
    expect(resolveStagedFile({ content: f }).fileName).toBe("report.docx");
  });

  it("lets an explicit name win over File.name", () => {
    const f = new File(["x"], "original.docx");
    expect(
      resolveStagedFile({ name: "renamed.docx", content: f }).fileName,
    ).toBe("renamed.docx");
  });

  it("throws when no name is resolvable (non-File content, no explicit name)", () => {
    expect(() => resolveStagedFile({ content: new Blob(["x"]) })).toThrow(
      InvalidOperationException,
    );
    expect(() => resolveStagedFile({ content: "x" })).toThrow(
      InvalidOperationException,
    );
  });

  it("trims the name and rejects empty/whitespace-only names", () => {
    expect(
      resolveStagedFile({ name: "  a.txt  ", content: "x" }).fileName,
    ).toBe("a.txt");
    expect(() => resolveStagedFile({ name: "   ", content: "x" })).toThrow(
      InvalidOperationException,
    );
  });

  it("rejects names containing path separators", () => {
    expect(() => resolveStagedFile({ name: "a/b.txt", content: "x" })).toThrow(
      InvalidOperationException,
    );
    expect(() => resolveStagedFile({ name: "a\\b.txt", content: "x" })).toThrow(
      InvalidOperationException,
    );
  });

  it("carries overwrite, onProgress, and signal through", () => {
    const onProgress = vi.fn();
    const ac = new AbortController();
    const staged = resolveStagedFile({
      name: "a.txt",
      content: "x",
      overwrite: true,
      onProgress,
      signal: ac.signal,
    });
    expect(staged.overwrite).toBe(true);
    expect(staged.onProgress).toBe(onProgress);
    expect(staged.signal).toBe(ac.signal);
  });
});
