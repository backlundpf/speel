import * as React from "react";
import {
  useEditor,
  useEditorState,
  EditorContent,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Callout,
  DefaultButton,
  IconButton,
  PrimaryButton,
  TextField,
  getTheme,
  mergeStyles,
} from "@fluentui/react";

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onBlur?: (() => void) | undefined;
  disabled?: boolean | undefined;
  /** Test/advanced hook: receives the live TipTap editor instance. */
  editorRef?: React.MutableRefObject<Editor | null> | undefined;
  /** Ids of the chrome's label and help text — ProseMirror's contenteditable is the
   *  control, so the association has to be set on the element it renders. */
  ariaLabelledBy?: string | undefined;
  ariaDescribedBy?: string | undefined;
}

/** TipTap's canonical empty document; the field treats it as an empty string. */
export function normalizeEditorHtml(html: string): string {
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

export default function RichTextEditor(p: RichTextEditorProps): JSX.Element {
  const editor = useEditor({
    extensions,
    content: p.value,
    editable: !p.disabled,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        ...(p.ariaLabelledBy !== undefined
          ? { "aria-labelledby": p.ariaLabelledBy }
          : {}),
        ...(p.ariaDescribedBy !== undefined
          ? { "aria-describedby": p.ariaDescribedBy }
          : {}),
      },
    },
    onUpdate: ({ editor: e }) => p.onChange(normalizeEditorHtml(e.getHTML())),
    ...(p.onBlur ? { onBlur: p.onBlur } : {}),
  });

  React.useEffect(() => {
    if (p.editorRef) p.editorRef.current = editor ?? null;
  }, [editor, p.editorRef]);

  // Echo guard: push the external value in only when it differs from the editor's
  // own HTML — otherwise every keystroke round-trips and resets the cursor.
  React.useEffect(() => {
    if (!editor) return;
    if (p.value !== normalizeEditorHtml(editor.getHTML())) {
      editor.commands.setContent(p.value, { emitUpdate: false });
    }
  }, [editor, p.value]);

  React.useEffect(() => {
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

  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkDraft, setLinkDraft] = React.useState("");
  const linkAnchor = React.useRef<HTMLSpanElement>(null);

  const openLink = (): void => {
    setLinkDraft(String(editor?.getAttributes("link").href ?? ""));
    setLinkOpen(true);
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

  const theme = getTheme();
  const contentClass = mergeStyles({
    border: `1px solid ${theme.semanticColors.inputBorder}`,
    borderRadius: 2,
    selectors: {
      "&:focus-within": {
        borderColor: theme.semanticColors.inputFocusBorderAlt,
      },
      "& .ProseMirror": { outline: "none", minHeight: 96, padding: "6px 8px" },
    },
  });

  const buttons: {
    icon: string;
    title: string;
    active?: boolean | undefined;
    run: () => void;
  }[] = [
    {
      icon: "Bold",
      title: "Bold",
      active: state?.bold,
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      icon: "Italic",
      title: "Italic",
      active: state?.italic,
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      icon: "Underline",
      title: "Underline",
      active: state?.underline,
      run: () => editor?.chain().focus().toggleUnderline().run(),
    },
    {
      icon: "Strikethrough",
      title: "Strikethrough",
      active: state?.strike,
      run: () => editor?.chain().focus().toggleStrike().run(),
    },
    {
      icon: "BulletedList",
      title: "Bulleted list",
      active: state?.bulletList,
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      icon: "NumberedList",
      title: "Numbered list",
      active: state?.orderedList,
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
  ];

  return (
    <div>
      <div role="toolbar" aria-label="Text formatting">
        {buttons.map((b) => (
          <IconButton
            key={b.title}
            iconProps={{ iconName: b.icon }}
            title={b.title}
            ariaLabel={b.title}
            toggle
            checked={!!b.active}
            disabled={!!p.disabled}
            onClick={b.run}
          />
        ))}
        <span ref={linkAnchor}>
          <IconButton
            iconProps={{ iconName: "Link" }}
            title="Link"
            ariaLabel="Link"
            toggle
            checked={!!state?.link}
            disabled={!!p.disabled}
            onClick={openLink}
          />
        </span>
        <IconButton
          iconProps={{ iconName: "Undo" }}
          title="Undo"
          ariaLabel="Undo"
          disabled={!!p.disabled || !state?.canUndo}
          onClick={() => editor?.chain().focus().undo().run()}
        />
        <IconButton
          iconProps={{ iconName: "Redo" }}
          title="Redo"
          ariaLabel="Redo"
          disabled={!!p.disabled || !state?.canRedo}
          onClick={() => editor?.chain().focus().redo().run()}
        />
      </div>
      <div className={contentClass}>
        <EditorContent editor={editor} />
      </div>
      {linkOpen ? (
        <Callout target={linkAnchor} onDismiss={() => setLinkOpen(false)}>
          <div style={{ padding: 12, display: "grid", gap: 8, minWidth: 260 }}>
            <TextField
              label="Link URL"
              value={linkDraft}
              onChange={(_e, v) => setLinkDraft(v ?? "")}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <PrimaryButton text="Apply" onClick={applyLink} />
              <DefaultButton text="Remove" onClick={removeLink} />
            </div>
          </div>
        </Callout>
      ) : null}
    </div>
  );
}
