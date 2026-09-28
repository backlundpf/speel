import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import RichTextEditor, {
  normalizeEditorHtml,
} from "../src/fluent-v8/RichTextEditor.js";

function renderEditor(value: string, onChange = vi.fn(), disabled = false) {
  const editorRef =
    createRef<Editor | null>() as React.MutableRefObject<Editor | null>;
  const utils = render(
    <RichTextEditor
      value={value}
      onChange={onChange}
      disabled={disabled}
      editorRef={editorRef}
    />,
  );
  return { ...utils, onChange, editorRef };
}

describe("normalizeEditorHtml", () => {
  it("maps TipTap's empty document to the empty string", () => {
    expect(normalizeEditorHtml("<p></p>")).toBe("");
    expect(normalizeEditorHtml("<p>x</p>")).toBe("<p>x</p>");
  });
});

describe("V8 RichTextEditor", () => {
  it("renders the initial HTML into the editor", () => {
    const { container } = renderEditor("<p>Hello <strong>world</strong></p>");
    expect(container.querySelector(".ProseMirror strong")?.textContent).toBe(
      "world",
    );
  });

  it("emits HTML on content change and '' when cleared", () => {
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

  it("syncs an external value change in, and skips echoes", () => {
    const { rerender, editorRef, onChange } = renderEditor("<p>One</p>");
    const editor = editorRef.current!;
    rerender(
      <RichTextEditor
        value="<p>Two</p>"
        onChange={onChange}
        editorRef={editorRef}
      />,
    );
    expect(editorRef.current).toBe(editor); // same instance, no remount
    expect(editor.getHTML()).toBe("<p>Two</p>");
    // Echo: re-rendering with the value the editor already holds is a no-op.
    rerender(
      <RichTextEditor
        value="<p>Two</p>"
        onChange={onChange}
        editorRef={editorRef}
      />,
    );
    expect(editor.getHTML()).toBe("<p>Two</p>");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables editing when disabled", () => {
    const { container } = renderEditor("<p>x</p>", vi.fn(), true);
    expect(
      container.querySelector('.ProseMirror[contenteditable="false"]'),
    ).not.toBeNull();
  });

  it("toolbar Bold toggles a strong mark on the selection", () => {
    const { editorRef, onChange } = renderEditor("<p>word</p>");
    act(() => {
      editorRef.current!.commands.selectAll();
    });
    fireEvent.click(screen.getByTitle("Bold"));
    expect(editorRef.current!.getHTML()).toBe("<p><strong>word</strong></p>");
    expect(onChange).toHaveBeenLastCalledWith("<p><strong>word</strong></p>");
  });

  it("link button applies an href via the callout", async () => {
    const { editorRef } = renderEditor("<p>site</p>");
    act(() => {
      editorRef.current!.commands.selectAll();
    });
    fireEvent.click(screen.getByTitle("Link"));
    const url = await screen.findByLabelText("Link URL");
    fireEvent.change(url, { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByText("Apply"));
    expect(editorRef.current!.getHTML()).toContain(
      'href="https://example.com"',
    );
  });
});
