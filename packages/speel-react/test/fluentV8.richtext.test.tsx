import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  V8RichTextInput,
  RichTextErrorBoundary,
} from "../src/fluent-v8/richText.js";

describe("V8RichTextInput", () => {
  it("lazy-mounts the TipTap editor with the field chrome", async () => {
    render(
      <V8RichTextInput label="Body" value="<p>Rich</p>" onChange={vi.fn()} />,
    );
    expect(screen.getByText("Body")).toBeInTheDocument(); // chrome label, immediate
    expect(await screen.findByText("Rich")).toBeInTheDocument(); // editor, post-lazy
    expect(document.querySelector(".ProseMirror")).not.toBeNull();
  });
});

describe("RichTextErrorBoundary", () => {
  it("renders the fallback when the child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom(): JSX.Element {
      throw new Error("chunk failed");
    }
    render(
      <RichTextErrorBoundary fallback={<textarea aria-label="plain" />}>
        <Boom />
      </RichTextErrorBoundary>,
    );
    expect(screen.getByLabelText("plain")).toBeInTheDocument();
    spy.mockRestore();
  });
});
