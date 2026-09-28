import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import type { MutableRefObject } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { ShadRichTextInput } from "../src/speel-shadcn/rich-text";
import { shadcnAdapter } from "../src/speel-shadcn/adapter";

function renderEditor(value: string, onChange = vi.fn()) {
  const editorRef =
    createRef<Editor | null>() as MutableRefObject<Editor | null>;
  const utils = render(
    <ShadRichTextInput
      label="Body"
      value={value}
      onChange={onChange}
      editorRef={editorRef}
    />,
  );
  return { ...utils, onChange, editorRef };
}

describe("ShadRichTextInput", () => {
  it("is registered on the adapter", () => {
    expect(shadcnAdapter.RichTextInput).toBe(ShadRichTextInput);
  });

  it("renders HTML content with chrome", () => {
    const { container } = renderEditor("<p>Hello <strong>world</strong></p>");
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror strong")?.textContent).toBe(
      "world",
    );
  });

  it("emits HTML and normalizes empty to ''", () => {
    const { onChange, editorRef } = renderEditor("");
    act(() => {
      editorRef.current!.commands.setContent("<p>Hi</p>", { emitUpdate: true });
    });
    expect(onChange).toHaveBeenLastCalledWith("<p>Hi</p>");
    act(() => {
      editorRef.current!.commands.setContent("<p></p>", { emitUpdate: true });
    });
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("toolbar Bold toggles strong", () => {
    const { editorRef } = renderEditor("<p>word</p>");
    act(() => {
      editorRef.current!.commands.selectAll();
    });
    fireEvent.click(screen.getByLabelText("Bold"));
    expect(editorRef.current!.getHTML()).toBe("<p><strong>word</strong></p>");
  });
});
