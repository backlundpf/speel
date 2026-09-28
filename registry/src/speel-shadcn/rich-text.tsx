import { useEffect, useState } from "react";
import type { MutableRefObject, ReactElement } from "react";
import {
  useEditor,
  useEditorState,
  EditorContent,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { RichTextInputProps } from "@speel/react";
import { Chrome, fieldAria } from "./chrome";
import { useStableId } from "./compat";

/** TipTap's canonical empty document; the field treats it as an empty string. */
function normalizeEditorHtml(html: string): string {
  return html === "<p></p>" ? "" : html;
}

// Full StarterKit schema: headings/blockquote/code have no toolbar buttons but stay
// reachable via paste, markdown input rules, and keyboard shortcuts — pasted
// structure is preserved rather than flattened. Links open on click only outside
// the editor (a click while editing should place the cursor, not navigate).
const extensions = [
  StarterKit.configure({
    link: { openOnClick: false },
  }),
];

export function ShadRichTextInput(
  p: RichTextInputProps & {
    /** Test/advanced hook: receives the live TipTap editor instance. */
    editorRef?: MutableRefObject<Editor | null>;
  },
): ReactElement {
  const id = useStableId();
  const aria = fieldAria(id, p, { labelledBy: true });
  const editor = useEditor({
    extensions,
    content: p.value,
    editable: !p.disabled,
    // ProseMirror owns the contenteditable, so the naming has to go through it.
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        ...(aria["aria-labelledby"] !== undefined
          ? { "aria-labelledby": aria["aria-labelledby"] }
          : {}),
        ...(aria["aria-describedby"] !== undefined
          ? { "aria-describedby": aria["aria-describedby"] }
          : {}),
      },
    },
    onUpdate: ({ editor: e }) => p.onChange(normalizeEditorHtml(e.getHTML())),
    ...(p.onBlur ? { onBlur: p.onBlur } : {}),
  });

  useEffect(() => {
    if (p.editorRef) p.editorRef.current = editor ?? null;
  }, [editor, p.editorRef]);

  // Echo guard: push the external value in only when it differs from the editor's
  // own HTML — otherwise every keystroke round-trips and resets the cursor.
  useEffect(() => {
    if (!editor) return;
    if (p.value !== normalizeEditorHtml(editor.getHTML())) {
      editor.commands.setContent(p.value, { emitUpdate: false });
    }
  }, [editor, p.value]);

  useEffect(() => {
    // Second arg suppresses the update event — this is a chrome change, not an edit.
    editor?.setEditable(!p.disabled, false);
  }, [editor, p.disabled]);

  const state = useEditorState({
    editor,
    selector: (ctx) =>
      ctx.editor
        ? {
            bold: ctx.editor.isActive("bold"),
            italic: ctx.editor.isActive("italic"),
            underline: ctx.editor.isActive("underline"),
            strike: ctx.editor.isActive("strike"),
            bulletList: ctx.editor.isActive("bulletList"),
            orderedList: ctx.editor.isActive("orderedList"),
            link: ctx.editor.isActive("link"),
            canUndo: ctx.editor.can().undo(),
            canRedo: ctx.editor.can().redo(),
          }
        : null,
  });

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");

  const openLink = (open: boolean): void => {
    if (open) setLinkDraft(String(editor?.getAttributes("link").href ?? ""));
    setLinkOpen(open);
  };
  const applyLink = (): void => {
    const href = linkDraft.trim();
    const chain = editor?.chain().focus().extendMarkRange("link");
    if (href) chain?.setLink({ href }).run();
    else chain?.unsetLink().run();
    setLinkOpen(false);
  };
  const removeLink = (): void => {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  };

  const marks: {
    icon: ReactElement;
    label: string;
    active?: boolean;
    run: () => void;
  }[] = [
    {
      icon: <Bold />,
      label: "Bold",
      active: state?.bold,
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      icon: <Italic />,
      label: "Italic",
      active: state?.italic,
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      icon: <Underline />,
      label: "Underline",
      active: state?.underline,
      run: () => editor?.chain().focus().toggleUnderline().run(),
    },
    {
      icon: <Strikethrough />,
      label: "Strikethrough",
      active: state?.strike,
      run: () => editor?.chain().focus().toggleStrike().run(),
    },
    {
      icon: <List />,
      label: "Bulleted list",
      active: state?.bulletList,
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      icon: <ListOrdered />,
      label: "Numbered list",
      active: state?.orderedList,
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
  ];

  return (
    <Chrome {...p} htmlFor={id}>
      <div
        className={cn(
          "rounded-md border border-input bg-transparent shadow-xs",
          "focus-within:ring-1 focus-within:ring-ring",
          p.disabled && "opacity-50",
        )}
      >
        <div
          role="toolbar"
          aria-label="Text formatting"
          className="flex flex-wrap items-center gap-0.5 border-b border-input p-1"
        >
          {marks.map((m) => (
            <Button
              key={m.label}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={m.label}
              aria-pressed={!!m.active}
              disabled={p.disabled}
              className={cn("size-7", m.active && "bg-accent")}
              onClick={m.run}
            >
              {m.icon}
            </Button>
          ))}
          <Popover open={linkOpen} onOpenChange={openLink}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Link"
                aria-pressed={!!state?.link}
                disabled={p.disabled}
                className={cn("size-7", state?.link && "bg-accent")}
              >
                <Link2 />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="grid w-72 gap-2">
              <Input
                aria-label="Link URL"
                placeholder="https://"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={applyLink}>
                  Apply
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={removeLink}
                >
                  Remove
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Undo"
            disabled={p.disabled || !state?.canUndo}
            className="size-7"
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Redo"
            disabled={p.disabled || !state?.canRedo}
            className="size-7"
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 />
          </Button>
        </div>
        <EditorContent
          editor={editor}
          className={cn(
            "text-sm",
            "[&_.ProseMirror]:min-h-24 [&_.ProseMirror]:px-3 [&_.ProseMirror]:py-2 [&_.ProseMirror]:outline-none",
            "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5",
            "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5",
            "[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline",
          )}
        />
      </div>
    </Chrome>
  );
}
